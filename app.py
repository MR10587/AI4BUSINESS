# app.py
import os
import json
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_bcrypt import Bcrypt
from sqlalchemy import func
from models import db, User, Startup, AuditLog
from services import rule_score_calc, call_gemini_score
from flask_cors import CORS


load_dotenv()

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///app.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "change-me")
db.init_app(app)
jwt = JWTManager(app)
bcrypt = Bcrypt(app)
CORS(app)


def get_json_body():
    # silent=True avoids Flask returning HTML 415/400 and lets us return JSON errors.
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def log_action(user_id, action, ip_address=None, user_agent=None):
    entry = AuditLog(
        user_id=user_id,
        action=action,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.session.add(entry)
    db.session.commit()


def current_user():
    user_id = get_jwt_identity()
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return None
    return User.query.get(user_id)


with app.app_context():
    db.create_all()

@app.post("/api/register")
def register():
    data = get_json_body()
    if data is None:
        return jsonify({"error": "Invalid or missing JSON body"}), 400

    name = data.get("name")
    email = data.get("email")
    password = data.get("password")
    role = data.get("role", "startup")
    if role not in ["startup", "investor"]:
        return jsonify({"error": "Invalid role"}), 400

    if not name or not email or not password:
        return jsonify({"error": "Missing data"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email exists"}), 409

    hashed = bcrypt.generate_password_hash(password).decode("utf-8")

    user = User(name=name, email=email, password_hash=hashed, role=role)
    db.session.add(user)
    db.session.commit()

    log_action(
        user.id,
        "register",
        request.remote_addr,
        request.headers.get("User-Agent"),
    )

    return jsonify({"message": "User created"}), 201

@app.post("/api/login")
def login():
    data = get_json_body()
    if data is None:
        return jsonify({"error": "Invalid or missing JSON body"}), 400

    email = data.get("email")
    password = data.get("password")
    if not email or not password:
        return jsonify({"error": "Missing data"}), 400

    user = User.query.filter_by(email=email).first()

    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_access_token(identity=str(user.id))

    log_action(
        user.id,
        "login",
        request.remote_addr,
        request.headers.get("User-Agent"),
    )

    return jsonify({
        "access_token": token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role
        }
    })

@app.get("/api/me")
@jwt_required()
def me():
    user = current_user()
    if not user:
        return jsonify({"error": "Invalid token subject"}), 401

    return jsonify({
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role
    })


@app.post("/api/startups")
@jwt_required()
def create_startup():
    user = current_user()
    if not user:
        return jsonify({"error": "Invalid token subject"}), 401
    if user.role not in ["startup", "admin"]:
        return jsonify({"error": "Forbidden"}), 403
    data = get_json_body()
    if data is None:
        return jsonify({"error": "Invalid or missing JSON body"}), 400

    required = ["idea", "industry", "team_size", "investment_needed", "market_impact"]
    if not all(data.get(k) is not None for k in required):
        return jsonify({"error": "Missing data"}), 400

    risk_flags = data.get("risk_flags", [])
    if isinstance(risk_flags, list):
        risk_flags = json.dumps(risk_flags)
    elif not isinstance(risk_flags, str):
        risk_flags = "[]"

    startup = Startup(
        user_id=user.id,
        idea=data["idea"],
        industry=data["industry"],
        team_size=int(data["team_size"]),
        investment_needed=float(data["investment_needed"]),
        market_impact=int(data["market_impact"]),
        stage=data.get("stage", "idea"),
        rule_score=0,
        ai_score=0,
        total_score=0,
        ai_explanation=None,
        risk_flags=risk_flags if isinstance(risk_flags, str) else "[]",
    )
    db.session.add(startup)
    db.session.commit()

    log_action(
        user.id,
        f"startup_create:{startup.id}",
        request.remote_addr,
        request.headers.get("User-Agent"),
    )

    return jsonify(startup.to_dict()), 201


@app.get("/api/startups")
@jwt_required()
def list_startups():
    user = current_user()
    if not user:
        return jsonify({"error": "Invalid token subject"}), 401

    if user.role in ["investor", "admin"]:
        startups = Startup.query.order_by(Startup.total_score.desc()).all()
    else:
        startups = Startup.query.filter_by(user_id=user.id).order_by(Startup.created_at.desc()).all()

    return jsonify([s.to_dict() for s in startups])


@app.get("/api/startups/<int:startup_id>")
@jwt_required()
def get_startup(startup_id):
    user = current_user()
    if not user:
        return jsonify({"error": "Invalid token subject"}), 401
    startup = Startup.query.get_or_404(startup_id)

    if user.role not in ["investor", "admin"] and startup.user_id != user.id:
        return jsonify({"error": "Forbidden"}), 403

    return jsonify(startup.to_dict())


@app.put("/api/startups/<int:startup_id>")
@jwt_required()
def update_startup(startup_id):
    user = current_user()
    if not user:
        return jsonify({"error": "Invalid token subject"}), 401
    startup = Startup.query.get_or_404(startup_id)

    if user.role not in ["admin"] and startup.user_id != user.id:
        return jsonify({"error": "Forbidden"}), 403

    data = get_json_body()
    if data is None:
        return jsonify({"error": "Invalid or missing JSON body"}), 400
    for field in [
        "idea",
        "industry",
        "team_size",
        "investment_needed",
        "market_impact",
        "stage",
    ]:
        if field in data:
            setattr(startup, field, data[field])

    if "risk_flags" in data:
        risk_flags = data["risk_flags"]
        if isinstance(risk_flags, list):
            startup.risk_flags = json.dumps(risk_flags)
        elif isinstance(risk_flags, str):
            startup.risk_flags = risk_flags

    db.session.commit()

    log_action(
        user.id,
        f"startup_update:{startup.id}",
        request.remote_addr,
        request.headers.get("User-Agent"),
    )

    return jsonify(startup.to_dict())


@app.post("/api/startups/<int:startup_id>/score")
@jwt_required()
def score_startup(startup_id):
    user = current_user()
    if not user:
        return jsonify({"error": "Invalid token subject"}), 401

    startup = Startup.query.filter_by(id=startup_id).first()
    if not startup:
        return jsonify({"error": "Startup not found"}), 404

    if user.role == "investor":
        return jsonify({"error": "Forbidden"}), 403
    if user.role == "startup" and startup.user_id != user.id:
        return jsonify({"error": "Forbidden"}), 403
    if user.role not in ["startup", "admin"]:
        return jsonify({"error": "Forbidden"}), 403

    rule_score = rule_score_calc(startup)
    ai_result = call_gemini_score(startup.idea, startup.industry)
    ai_score = (
        ai_result["clarity"]
        + ai_result["feasibility"]
        + ai_result["differentiation"]
        + ai_result["market_logic"]
    )
    ai_score = max(0, min(40, int(ai_score)))

    startup.rule_score = rule_score
    startup.ai_score = ai_score
    startup.ai_explanation = ai_result["explanation"]
    startup.risk_flags = json.dumps(ai_result["risk_flags"])
    startup.total_score = min(100, rule_score + startup.ai_score)
    db.session.commit()

    log_action(
        user.id,
        f"startup_scored:{startup.id}",
        request.remote_addr,
        request.headers.get("User-Agent"),
    )

    return jsonify(
        {
            "rule_score": startup.rule_score,
            "ai_score": startup.ai_score,
            "total_score": startup.total_score,
            "explanation": startup.ai_explanation or "",
            "risk_flags": ai_result["risk_flags"],
        }
    ), 200


@app.delete("/api/startups/<int:startup_id>")
@jwt_required()
def delete_startup(startup_id):
    user = current_user()
    if not user:
        return jsonify({"error": "Invalid token subject"}), 401
    startup = Startup.query.get_or_404(startup_id)

    if user.role not in ["admin"] and startup.user_id != user.id:
        return jsonify({"error": "Forbidden"}), 403

    db.session.delete(startup)
    db.session.commit()

    log_action(
        user.id,
        f"startup_delete:{startup.id}",
        request.remote_addr,
        request.headers.get("User-Agent"),
    )

    return jsonify({"message": "Deleted"}), 200


@app.get("/api/audit")
@jwt_required()
def list_audit():
    user = current_user()
    if not user:
        return jsonify({"error": "Invalid token subject"}), 401
    if user.role != "admin":
        return jsonify({"error": "Forbidden"}), 403

    logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(200).all()
    return jsonify([l.to_dict() for l in logs])


@app.get("/api/admin/kpi")
@jwt_required()
def admin_kpi():
    user = current_user()
    if not user:
        return jsonify({"error": "Invalid token subject"}), 401
    if user.role != "admin":
        return jsonify({"error": "Forbidden"}), 403

    total_startups = Startup.query.count()
    avg_total_score = db.session.query(func.avg(Startup.total_score)).scalar() or 0
    avg_total_score = round(float(avg_total_score), 2)

    top_rows = (
        db.session.query(Startup.industry, func.count(Startup.id).label("count"))
        .group_by(Startup.industry)
        .order_by(func.count(Startup.id).desc())
        .limit(5)
        .all()
    )
    top_industries = [{"industry": row[0], "count": row[1]} for row in top_rows]

    score_rows = Startup.query.with_entities(Startup.total_score).all()
    distribution = {"0_39": 0, "40_59": 0, "60_79": 0, "80_100": 0}
    for (score,) in score_rows:
        value = int(score or 0)
        if value <= 39:
            distribution["0_39"] += 1
        elif value <= 59:
            distribution["40_59"] += 1
        elif value <= 79:
            distribution["60_79"] += 1
        else:
            distribution["80_100"] += 1

    activity_rows = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(10).all()
    recent_activity = [
        {
            "action": row.action,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "user_id": row.user_id,
        }
        for row in activity_rows
    ]

    return jsonify(
        {
            "total_startups": total_startups,
            "avg_total_score": avg_total_score,
            "top_industries": top_industries,
            "score_distribution": distribution,
            "recent_activity": recent_activity,
        }
    ), 200

if __name__ == "__main__":
    app.run(debug=True)
