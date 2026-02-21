# app.py
import os
import json
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_bcrypt import Bcrypt
from sqlalchemy import func, text
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
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "http://127.0.0.1:5500",
                "http://localhost:5500",
            ]
        }
    },
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
)


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


def clamp(value, min_value, max_value):
    return max(min_value, min(max_value, value))


def parse_int(value, field_name):
    try:
        return int(value), None
    except (TypeError, ValueError):
        return None, f"Invalid {field_name}"


def parse_float(value, field_name):
    try:
        return float(value), None
    except (TypeError, ValueError):
        return None, f"Invalid {field_name}"


def require_admin_user():
    user = current_user()
    if not user:
        return None, (jsonify({"error": "Invalid token subject"}), 401)
    if user.role != "admin":
        return None, (jsonify({"error": "Forbidden"}), 403)
    return user, None


def ensure_schema():
    # Lightweight SQLite-safe schema patch for MVP (no migrations).
    cols = db.session.execute(text("PRAGMA table_info(startups)")).fetchall()
    col_names = {row[1] for row in cols}
    if "name" not in col_names:
        db.session.execute(text("ALTER TABLE startups ADD COLUMN name VARCHAR(120) NOT NULL DEFAULT ''"))
        db.session.commit()


with app.app_context():
    db.create_all()
    ensure_schema()

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

    required = ["name", "idea", "industry", "team_size", "investment_needed"]
    if not all(data.get(k) is not None for k in required):
        return jsonify({"error": "Missing data"}), 400
    if not str(data.get("name", "")).strip():
        return jsonify({"error": "Missing data"}), 400

    team_size, err = parse_int(data.get("team_size"), "team_size")
    if err:
        return jsonify({"error": err}), 400
    investment_needed, err = parse_float(data.get("investment_needed"), "investment_needed")
    if err:
        return jsonify({"error": err}), 400

    risk_flags = data.get("risk_flags", [])
    if isinstance(risk_flags, list):
        risk_flags = json.dumps(risk_flags)
    elif not isinstance(risk_flags, str):
        risk_flags = "[]"

    startup = Startup(
        user_id=user.id,
        name=str(data["name"]).strip(),
        idea=data["idea"],
        industry=data["industry"],
        team_size=team_size,
        investment_needed=investment_needed,
        market_impact=5,
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
    if "name" in data and not str(data.get("name", "")).strip():
        return jsonify({"error": "Missing data"}), 400
    for field in [
        "name",
        "idea",
        "industry",
        "team_size",
        "investment_needed",
        "stage",
    ]:
        if field in data:
            if field == "team_size":
                parsed, err = parse_int(data.get(field), "team_size")
                if err:
                    return jsonify({"error": err}), 400
                setattr(startup, field, parsed)
                continue
            if field == "investment_needed":
                parsed, err = parse_float(data.get(field), "investment_needed")
                if err:
                    return jsonify({"error": err}), 400
                setattr(startup, field, parsed)
                continue
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

    ai_result = call_gemini_score(startup.idea, startup.industry)
    market_logic = int(ai_result.get("market_logic", 0) or 0)
    startup.market_impact = 5 if market_logic <= 0 else clamp(market_logic, 1, 10)
    rule_score = rule_score_calc(startup)
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
            "ai_breakdown": {
                "clarity": ai_result["clarity"],
                "feasibility": ai_result["feasibility"],
                "differentiation": ai_result["differentiation"],
                "market_logic": ai_result["market_logic"],
            },
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


@app.post("/api/admin/change-password")
@jwt_required()
def admin_change_password():
    admin_user, err = require_admin_user()
    if err:
        return err

    data = get_json_body()
    if data is None:
        return jsonify({"error": "Invalid or missing JSON body"}), 400

    current_password = data.get("current_password")
    new_password = data.get("new_password")
    confirm_password = data.get("confirm_password")

    if not current_password or not new_password or not confirm_password:
        return jsonify({"error": "Missing data"}), 400
    if len(str(new_password)) < 8:
        return jsonify({"error": "New password must be at least 8 characters"}), 400
    if new_password != confirm_password:
        return jsonify({"error": "Passwords do not match"}), 400
    if not bcrypt.check_password_hash(admin_user.password_hash, current_password):
        return jsonify({"error": "Current password is incorrect"}), 400

    admin_user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
    db.session.commit()

    log_action(
        admin_user.id,
        "admin_password_changed",
        request.remote_addr,
        request.headers.get("User-Agent"),
    )
    return jsonify({"message": "Password updated"}), 200


@app.get("/api/admin/users")
@jwt_required()
def admin_list_users():
    admin_user, err = require_admin_user()
    if err:
        return err

    rows = (
        db.session.query(User, func.count(Startup.id).label("startups_count"))
        .outerjoin(Startup, Startup.user_id == User.id)
        .group_by(User.id)
        .order_by(User.created_at.desc())
        .all()
    )

    result = []
    for user_row, startups_count in rows:
        result.append(
            {
                "id": user_row.id,
                "email": user_row.email,
                "role": user_row.role,
                "created_at": user_row.created_at.isoformat() if user_row.created_at else None,
                "startups_count": int(startups_count or 0),
            }
        )

    log_action(
        admin_user.id,
        "admin_list_users",
        request.remote_addr,
        request.headers.get("User-Agent"),
    )
    return jsonify(result), 200


@app.delete("/api/admin/users/<int:user_id>")
@jwt_required()
def admin_delete_user(user_id):
    admin_user, err = require_admin_user()
    if err:
        return err

    if admin_user.id == user_id:
        return jsonify({"error": "Admin cannot delete themself"}), 400

    user_to_delete = User.query.filter_by(id=user_id).first()
    if not user_to_delete:
        return jsonify({"error": "User not found"}), 404

    # Policy 1: cascade delete startups for hackathon speed.
    Startup.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    AuditLog.query.filter_by(user_id=user_id).update({"user_id": None}, synchronize_session=False)
    db.session.delete(user_to_delete)
    db.session.commit()

    log_action(
        admin_user.id,
        f"admin_deleted_user:{user_id}",
        request.remote_addr,
        request.headers.get("User-Agent"),
    )
    return jsonify({"message": "User deleted"}), 200


@app.delete("/api/admin/startups/<int:startup_id>")
@jwt_required()
def admin_delete_startup(startup_id):
    admin_user, err = require_admin_user()
    if err:
        return err

    startup = Startup.query.filter_by(id=startup_id).first()
    if not startup:
        return jsonify({"error": "Startup not found"}), 404

    db.session.delete(startup)
    db.session.commit()

    log_action(
        admin_user.id,
        f"admin_deleted_startup:{startup_id}",
        request.remote_addr,
        request.headers.get("User-Agent"),
    )
    return jsonify({"message": "Startup deleted"}), 200

if __name__ == "__main__":
    app.run(debug=True)
