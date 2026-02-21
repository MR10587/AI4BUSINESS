# app.py
import os
from flask import Flask
from dotenv import load_dotenv

from models import db, User, Startup, AuditLog  # noqa: F401

load_dotenv()

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///app.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db.init_app(app)

if __name__ == "__main__":
    app.run(debug=True)
