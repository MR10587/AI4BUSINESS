# app.py
import os
import json
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_bcrypt import Bcrypt
from models import db, User, Startup, AuditLog  # noqa: F401

load_dotenv()

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///app.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "change-me")
db.init_app(app)
jwt = JWTManager(app)
bcrypt = Bcrypt(app)


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

@app.post("/api/register")
def register():
    data = get_json_body()
    if data is None:
        return jsonify({"error": "Invalid or missing JSON body"}), 400

    name = data.get("name")
    email = data.get("email")
    password = data.get("password")
    role = data.get("role", "startup")

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
        rule_score=int(data.get("rule_score", 0)),
        ai_score=int(data.get("ai_score", 0)),
        total_score=int(data.get("total_score", 0)),
        ai_explanation=data.get("ai_explanation"),
        risk_flags=risk_flags,
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
        "rule_score",
        "ai_score",
        "total_score",
        "ai_explanation",
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

if __name__ == "__main__":
    app.run(debug=True)
