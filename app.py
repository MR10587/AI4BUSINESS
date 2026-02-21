# app.py
import os
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_bcrypt import Bcrypt
from models import db, User, Startup, AuditLog  # noqa: F401

load_dotenv()

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///app.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db.init_app(app)
jwt = JWTManager(app)
bcrypt = Bcrypt(app)

from flask import request, jsonify
from models import User, db

@app.post("/api/register")
def register():
    data = request.get_json()

    email = data.get("email")
    password = data.get("password")
    role = data.get("role", "startup")

    if not email or not password:
        return jsonify({"error": "Missing data"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email exists"}), 409

    hashed = bcrypt.generate_password_hash(password).decode("utf-8")

    user = User(email=email, password_hash=hashed, role=role)
    db.session.add(user)
    db.session.commit()

    return jsonify({"message": "User created"}), 201

@app.post("/api/login")
def login():
    data = request.get_json()

    email = data.get("email")
    password = data.get("password")

    user = User.query.filter_by(email=email).first()

    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_access_token(identity=user.id)

    return jsonify({
        "access_token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role
        }
    })

@app.get("/api/me")
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    return jsonify({
        "id": user.id,
        "email": user.email,
        "role": user.role
    })

if __name__ == "__main__":
    app.run(debug=True)
