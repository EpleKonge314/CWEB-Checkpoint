import os
from datetime import datetime
from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy

# -------------------------------
# Flask & Database Setup
# -------------------------------
app = Flask(__name__)
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(basedir, "game.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['ADMIN_TOKEN'] = os.environ.get('ADMIN_TOKEN', '666')
db = SQLAlchemy(app)

# -------------------------------
# Database Models
# -------------------------------
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    coins = db.Column(db.Integer, default=0)
    player_skin = db.Column(db.String(64), default="default")
    enemy_skin = db.Column(db.String(64), default="default")

class Score(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), nullable=False, default='Anonymous')
    survival_time = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    username = db.Column(db.String(64), nullable=False, default='Anonymous')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class ShopItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(64), unique=True, nullable=False)
    category = db.Column(db.String(32), nullable=False)  # 'player' or 'enemy'
    display_name = db.Column(db.String(64), nullable=False)
    price = db.Column(db.Integer, nullable=False)
    img = db.Column(db.String(128))

class OwnedItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), db.ForeignKey('user.username'))
    item_key = db.Column(db.String(64), db.ForeignKey('shop_item.key'))
    db.UniqueConstraint('username', 'item_key', name='unique_ownership')

# -------------------------------
# Initialize Tables
# -------------------------------
with app.app_context():
    db.create_all()

# -------------------------------
# Helper Functions
# -------------------------------
def get_or_create_user(username: str):
    if not username:
        username = "Anonymous"
    user = User.query.filter_by(username=username).first()
    if not user:
        user = User(username=username)
        db.session.add(user)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            return None
    return user

# -------------------------------
# Routes — Pages
# -------------------------------
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/canvas')
def canvas_page():
    return render_template('canvas.html')

@app.route('/leaderboard')
def leaderboard_page():
    return render_template('leaderboard.html')

@app.route('/shop')
def shop_page():
    items = ShopItem.query.all()
    return render_template('shop.html', items=items)

# -------------------------------
# API — Coins
# -------------------------------
@app.route('/api/coins', methods=['GET', 'POST'])
def coins():
    username = request.args.get('username') or (request.json.get('username') if request.is_json else None)
    if not username:
        return jsonify({'error': 'Missing username'}), 400
    user = get_or_create_user(username)
    if not user:
        return jsonify({'error': 'User creation failed'}), 500

    # POST is still allowed (for backward compatibility)
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        coins_to_add = int(data.get('coins', 0))
        user.coins += coins_to_add
        if user.coins < 0:
            user.coins = 0
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            return jsonify({'error': 'Failed to update coins'}), 500
        return jsonify({'username': user.username, 'coins': user.coins})

    # Default: GET
    return jsonify({'username': user.username, 'coins': user.coins})

@app.route("/api/coins/add", methods=["POST"])
def add_coins():
    """
    Adds coins to the user's account atomically.
    Called when the player collects coins in the game.
    """
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    coins_to_add = int(data.get("coins", 0))
    if not username or coins_to_add <= 0:
        return jsonify({"error": "Invalid request"}), 400

    user = get_or_create_user(username)
    if not user:
        return jsonify({"error": "User not found"}), 404

    try:
        User.query.filter_by(username=username).update(
            {User.coins: User.coins + coins_to_add}
        )
        db.session.commit()
        user = User.query.filter_by(username=username).first()
        if user.coins < 0:
            user.coins = 0
        return jsonify({"success": True, "username": user.username, "coins": user.coins})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error", "details": str(e)}), 500

# -------------------------------
# API — Shop
# -------------------------------
@app.route('/api/shop/items', methods=['GET'])
def shop_items():
    items = ShopItem.query.all()
    return jsonify([{
        'key': i.key,
        'category': i.category,
        'display_name': i.display_name,
        'price': i.price,
        'img': i.img
    } for i in items])

@app.route('/api/shop/user', methods=['GET', 'POST'])
def shop_user():
    username = request.args.get('username') or (request.json.get('username') if request.is_json else None)
    if not username:
        return jsonify({'error': 'Missing username'}), 400
    user = get_or_create_user(username)
    if not user:
        return jsonify({'error': 'User creation failed'}), 500

    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        if 'player_skin' in data: user.player_skin = data['player_skin']
        if 'enemy_skin' in data: user.enemy_skin = data['enemy_skin']
        if 'coins' in data: user.coins = int(data['coins'])
        if user.coins < 0: user.coins = 0
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            return jsonify({'error': 'Failed to update user'}), 500
        return jsonify({
            'message': 'Updated',
            'data': {
                'username': user.username,
                'coins': user.coins,
                'player_skin': user.player_skin,
                'enemy_skin': user.enemy_skin
            }
        })

    owned_items = OwnedItem.query.filter_by(username=user.username).all()
    owned_keys = [oi.item_key for oi in owned_items]
    return jsonify({
        'username': user.username,
        'coins': user.coins,
        'player_skin': user.player_skin,
        'enemy_skin': user.enemy_skin,
        'owned_items': owned_keys
    })

@app.route('/api/shop/buy', methods=['POST'])
def shop_buy():
    data = request.get_json(silent=True) or {}
    username, item_key = data.get('username'), data.get('item_key')
    if not username or not item_key:
        return jsonify({'error': 'Missing username or item_key'}), 400

    user = get_or_create_user(username)
    item = ShopItem.query.filter_by(key=item_key).first()
    if not item:
        return jsonify({'error': 'Item not found'}), 404
    if user.coins < item.price:
        return jsonify({'error': 'Not enough coins'}), 400
    if OwnedItem.query.filter_by(username=username, item_key=item_key).first():
        return jsonify({'error': 'Already owned'}), 400

    try:
        with db.session.begin():
            user.coins = max(0, user.coins - item.price)
            db.session.add(OwnedItem(username=username, item_key=item_key))
        return jsonify({'success': True, 'coins': user.coins})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Purchase failed', 'details': str(e)}), 500

@app.route('/api/shop/equip', methods=['POST'])
def shop_equip():
    data = request.get_json(silent=True) or {}
    username, item_key = data.get('username'), data.get('item_key')
    if not username or not item_key:
        return jsonify({'error': 'Missing username or item_key'}), 400

    user = get_or_create_user(username)
    item = ShopItem.query.filter_by(key=item_key).first()
    owned = OwnedItem.query.filter_by(username=username, item_key=item_key).first()
    if not item:
        return jsonify({'error': 'Item not found'}), 404
    if not owned:
        return jsonify({'error': 'Item not owned'}), 400

    if item.category == 'player':
        user.player_skin = item.key
    else:
        user.enemy_skin = item.key

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Equip failed'}), 500
    return jsonify({'success': True})

@app.route('/api/shop/sync', methods=['GET'])
def shop_sync():
    """Optional unified endpoint for skin + coin sync."""
    username = request.args.get('username')
    if not username:
        return jsonify({'error': 'Missing username'}), 400
    user = get_or_create_user(username)
    return jsonify({
        'username': user.username,
        'coins': user.coins,
        'player_skin': user.player_skin,
        'enemy_skin': user.enemy_skin
    })

# -------------------------------
# API — Scores / Leaderboard
# -------------------------------
@app.route('/scores', methods=['GET', 'POST'])
def scores():
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        username = (data.get('username') or 'Anonymous').strip()[:64]
        survival_time = float(data.get('survival_time') or 0)
        if survival_time <= 0:
            return jsonify({'error': 'Invalid survival time'}), 400

        s = Score(username=username, survival_time=survival_time)
        db.session.add(s)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            return jsonify({'error': 'Failed to save score'}), 500

        return jsonify({'id': s.id, 'username': s.username, 'survival_time': s.survival_time}), 201

    scores = Score.query.order_by(Score.survival_time.desc()).limit(10).all()
    return jsonify([{
        'id': s.id,
        'username': s.username,
        'survival_time': round(s.survival_time, 2),
        'created_at': s.created_at.isoformat()
    } for s in scores])

@app.route('/api/personal_best', methods=['GET'])
def personal_best():
    username = request.args.get('username')
    if not username:
        return jsonify({'error': 'Missing username'}), 400
    best = Score.query.filter_by(username=username).order_by(Score.survival_time.desc()).first()
    if not best:
        return jsonify({'username': username, 'personal_best': 0})
    return jsonify({'username': username, 'personal_best': best.survival_time})

# -------------------------------
# API — Messages
# -------------------------------
@app.route('/messages', methods=['GET', 'POST'])
def messages():
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        content = (data.get('content') or '').strip()
        username = (data.get('username') or 'Anonymous').strip()[:64]
        if not content:
            return jsonify({'error': 'Empty content'}), 400
        m = Message(content=content, username=username)
        db.session.add(m)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            return jsonify({'error': 'Failed to save message'}), 500
        return jsonify({'id': m.id, 'content': m.content, 'username': m.username, 'created_at': m.created_at.isoformat()}), 201

    msgs = Message.query.order_by(Message.created_at.asc()).limit(200).all()
    return jsonify([{
        'id': m.id,
        'content': m.content,
        'username': m.username,
        'created_at': m.created_at.isoformat()
    } for m in msgs])

@app.route('/messages/<int:message_id>', methods=['DELETE'])
def delete_message(message_id):
    m = Message.query.get(message_id)
    if not m:
        return jsonify({'error': 'Not found'}), 404
    token = request.headers.get('X-Admin-Token', '')
    if token != app.config['ADMIN_TOKEN']:
        return jsonify({'error': 'forbidden'}), 403
    db.session.delete(m)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Delete failed'}), 500
    return jsonify({'result': 'deleted'}), 200

# -------------------------------
# CLI Command — Seed Shop Items
# -------------------------------
@app.cli.command('seed_shop')
def seed_shop():
    skins = [
        ShopItem(key='skin_blue', category='player', display_name='Blue Square', price=50, img='/static/images/skins/blue_square.png'),
        ShopItem(key='skin_red', category='player', display_name='Red Square', price=75, img='/static/images/skins/red_square.png'),
        ShopItem(key='enemy_gold', category='enemy', display_name='Gold Enemy', price=100, img='/static/images/skins/gold_enemy.png')
    ]
    for s in skins:
        if not ShopItem.query.filter_by(key=s.key).first():
            db.session.add(s)
    db.session.commit()
    print("✅ Shop items seeded!")

# -------------------------------
# Run App
# -------------------------------
if __name__ == "__main__":
    app.run(debug=True)
