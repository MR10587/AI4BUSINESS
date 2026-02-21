import json
from datetime import datetime

from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    startups = db.relationship("Startup", back_populates="owner", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Startup(db.Model):
    __tablename__ = "startups"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False, default="")
    idea = db.Column(db.Text, nullable=False)
    industry = db.Column(db.String(100), nullable=False, index=True)
    team_size = db.Column(db.Integer, nullable=False)
    investment_needed = db.Column(db.Float, nullable=False)
    market_impact = db.Column(db.Integer, nullable=False)
    stage = db.Column(db.String(20), nullable=False, default="idea")
    rule_score = db.Column(db.Integer, nullable=False, default=0)
    ai_score = db.Column(db.Integer, nullable=False, default=0)
    total_score = db.Column(db.Integer, nullable=False, default=0, index=True)
    ai_explanation = db.Column(db.Text, nullable=True)
    risk_flags = db.Column(db.Text, nullable=False, default="[]")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    owner = db.relationship("User", back_populates="startups", lazy=True)

    def to_dict(self):
        risk_flags_list = []
        if self.risk_flags:
            try:
                parsed = json.loads(self.risk_flags)
                if isinstance(parsed, list):
                    risk_flags_list = parsed
            except (json.JSONDecodeError, TypeError):
                risk_flags_list = []

        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "idea": self.idea,
            "industry": self.industry,
            "team_size": self.team_size,
            "investment_needed": self.investment_needed,
            "market_impact": self.market_impact,
            "stage": self.stage,
            "rule_score": self.rule_score,
            "ai_score": self.ai_score,
            "total_score": self.total_score,
            "ai_explanation": self.ai_explanation,
            "risk_flags": risk_flags_list,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    action = db.Column(db.String(255), nullable=False)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "action": self.action,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

