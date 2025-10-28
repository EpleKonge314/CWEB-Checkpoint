from cProfile import Profile
from flask import Flask, request, render_template, jsonify, url_for
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os

app = Flask(__name__)

# Simple SQLite DB in project folder
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'chat.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)


class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    username = db.Column(db.String(64), nullable=False, default='Anonymous')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

@app.route('/scores', methods=['GET'])
def get_scores():
    scores = Score.query.order_by(Score.survival_time.desc()).limit(10).all()
    return jsonify([
        {
            'id': s.id,
            'username': s.username,
            'survival_time': round(s.survival_time, 2),
            'created_at': s.created_at.isoformat()
        } for s in scores
    ])

@app.route('/scores', methods=['POST'])
def post_score():
    data = request.get_json() or {}
    username = (data.get('username') or 'Anonymous').strip()[:64]
    survival_time = float(data.get('survival_time') or 0)
    if survival_time <= 0:
        return jsonify({'error': 'Invalid survival time'}), 400

    s = Score(username=username, survival_time=survival_time)
    db.session.add(s)
    db.session.commit()
    return jsonify({'id': s.id, 'username': s.username, 'survival_time': s.survival_time}), 201

@app.before_request
def create_tables():
    db.create_all()


@app.route('/')
def home():
    return render_template('index.html')


@app.route('/canvas')
def canvas_page():
    return render_template('canvas.html')

@app.route('/leaderboard')
def leaderboard_page():
    return render_template('leaderboard.html')


@app.route('/messages', methods=['GET'])
def get_messages():
    msgs = Message.query.order_by(Message.created_at.asc()).limit(200).all()
    return jsonify([{
        'id': m.id,
        'content': m.content,
        'username': m.username,
        'created_at': m.created_at.isoformat()
    } for m in msgs])

@app.route('/messages', methods=['POST'])
def post_message():
    data = request.get_json() or {}
    content = (data.get('content') or '').strip()
    username = (data.get('username') or 'Anonymous').strip()[:64]
    if not content:
        return jsonify({'error': 'Empty content'}), 400
    m = Message(content=content, username=username)
    db.session.add(m)
    db.session.commit()
    return jsonify({'id': m.id, 'content': m.content, 'username': m.username, 'created_at': m.created_at.isoformat()}), 201

#admin token is 666
@app.route('/messages/<int:message_id>', methods=['DELETE'])
def delete_message(message_id):
    m = Message.query.get(message_id)
    if m is None:
        return jsonify({'error': 'Not found'}), 404
    # Admin-only deletion -- check admin token header

    admin_token = request.headers.get('X-Admin-Token', '')
    expected = app.config.get('ADMIN_TOKEN') or os.environ.get('ADMIN_TOKEN') or '666'
    if admin_token != expected:
        return jsonify({'error': 'forbidden'}), 403
    db.session.delete(m)
    db.session.commit()
    return jsonify({'result': 'deleted'}), 200


# configure admin token
app.config['ADMIN_TOKEN'] = os.environ.get('ADMIN_TOKEN', '666')

class Score(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), nullable=False, default='Anonymous')
    survival_time = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
