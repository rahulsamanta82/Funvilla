const fs = require('fs');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore: createFirestoreClient } = require('firebase-admin/firestore');
const User = require('./modal/userModal');
const Activity = require('./modal/activityModal');

const loadEnv = (file) => {
    if (!fs.existsSync(file)) {
        return;
    }
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const separator = trimmed.indexOf('=');
        if (separator === -1) {
            continue;
        }
        const key = trimmed.slice(0, separator).trim();
        let value = trimmed.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
};

loadEnv(path.join(__dirname, '.env'));

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/funville';
const MONGODB_URI_FALLBACK = process.env.MONGODB_URI_FALLBACK || '';
const JWT_SECRET = process.env.JWT_SECRET || 'funville-local-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;
const ACTIVITY_HISTORY_LIMIT = Math.min(Math.max(Number(process.env.ACTIVITY_HISTORY_LIMIT) || 100, 1), 500);
const FIRESTORE_TIMEOUT_MS = Number(process.env.FIRESTORE_TIMEOUT_MS) || 3000;
const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Firebase Admin + Firestore mirror
// ---------------------------------------------------------------------------

const initFirebase = () => {
    if (admin.getApps && admin.getApps().length) {
        return admin.getApp();
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
        console.warn('Firebase Admin not configured. Google sign-in and Firestore sync are disabled.');
        return null;
    }

    try {
        const firebaseApp = admin.initializeApp({
            credential: admin.cert({ projectId, clientEmail, privateKey })
        });
        console.log('Connected to Firebase Admin');
        return firebaseApp;
    } catch (error) {
        console.error('Firebase Admin initialization failed:', error.message);
        return null;
    }
};

const firebaseApp = initFirebase();

let firestoreDb;
let firestoreDisabled = false;
let firestoreStatus = 'unknown';

const getFirestore = () => {
    if (!firebaseApp || firestoreDisabled) {
        return null;
    }
    if (firestoreDb !== undefined) {
        return firestoreDb;
    }
    try {
        firestoreDb = createFirestoreClient(firebaseApp);
        firestoreDb.settings({ ignoreUndefinedProperties: true });
        firestoreStatus = 'initialized';
        console.log('Connected to Firestore');
        return firestoreDb;
    } catch (error) {
        console.warn('Firestore unavailable:', error.message);
        firestoreDisabled = true;
        firestoreStatus = 'disabled';
        firestoreDb = null;
        return null;
    }
};

const runFirestoreTask = async (label, task) => {
    const db = getFirestore();
    if (!db) {
        return;
    }

    const work = Promise.resolve().then(() => task(db));
    work.catch(() => {});

    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), FIRESTORE_TIMEOUT_MS);
    });

    try {
        await Promise.race([work, timeout]);
        firestoreStatus = 'ok';
    } catch (error) {
        const message = error.message || String(error);
        const permanent = error.code === 7
            || error.code === 5
            || error.code === 3
            || /has not been used|is disabled|NOT_FOUND|PERMISSION_DENIED|timed out/i.test(message);

        if (permanent) {
            firestoreDisabled = true;
            firestoreStatus = 'disabled';
            console.warn(`${label} disabled for this session: ${message}`);
            console.warn('Enable Cloud Firestore in the Firebase console to sync users and activity.');
        } else {
            console.log(`${label} skipped: ${message}`);
        }
    } finally {
        clearTimeout(timer);
    }
};

const mirrorUserToFirestore = (user, extra = {}) => runFirestoreTask('Firestore user sync', (db) => {
    return db.collection('users').doc(String(user._id)).set(Object.assign({
        mongoId: String(user._id),
        username: user.username,
        email: user.email,
        provider: user.provider || 'password',
        firebaseUid: user.firebaseUid || null,
        picture: user.picture || null,
        favorites: user.favorites || [],
        recentlyPlayed: (user.recentlyPlayed || []).map((item) => ({
            gameId: item.gameId,
            playedAt: item.playedAt ? new Date(item.playedAt) : null
        })),
        createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
        updatedAt: new Date()
    }, extra), { merge: true });
});

const mirrorActivityToFirestore = (user, entry) => runFirestoreTask('Firestore activity sync', (db) => {
    return db.collection('users').doc(String(user._id)).collection('activity').add({
        action: entry.action,
        gameId: entry.gameId || null,
        gameTitle: entry.gameTitle || null,
        createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date()
    });
});

// ---------------------------------------------------------------------------
// Database + auth helpers
// ---------------------------------------------------------------------------

const connectToDatabase = async () => {
    try {
        await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
        console.log(`Connected to MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`);
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        if (!MONGODB_URI_FALLBACK || process.env.NODE_ENV === 'production') {
            throw error;
        }
        console.warn('Using MONGODB_URI_FALLBACK for local development.');
        await mongoose.connect(MONGODB_URI_FALLBACK, { serverSelectionTimeoutMS: 10000 });
        console.log(`Connected to fallback MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`);
    }
};

// Tokens revoked through logout (kept in memory for this simple deployment).
const revokedTokens = new Map();

const isTokenRevoked = (token) => {
    const expiresAt = revokedTokens.get(token);
    if (!expiresAt) {
        return false;
    }
    if (Date.now() >= expiresAt) {
        revokedTokens.delete(token);
        return false;
    }
    return true;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GAME_ID_PATTERN = /^[a-z0-9-]{1,40}$/;

const cleanGameTitle = (value) => {
    const title = String(value || '').trim().slice(0, 120);
    return title || undefined;
};

const publicUser = (user) => ({
    id: user._id,
    username: user.username,
    email: user.email,
    provider: user.provider || 'password',
    picture: user.picture || null,
    favorites: user.favorites || [],
    recentlyPlayed: (user.recentlyPlayed || []).map((item) => ({
        gameId: item.gameId,
        playedAt: item.playedAt
    })),
    createdAt: user.createdAt
});

const createToken = (user) => jwt.sign(
    { id: user._id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
);

const logActivity = async (user, action, details = {}) => {
    const payload = {
        userId: user._id,
        username: user.username,
        email: user.email,
        action,
        gameId: details.gameId || undefined,
        gameTitle: details.gameTitle || undefined
    };

    let entry = null;
    try {
        entry = await Activity.create(payload);
    } catch (error) {
        console.log('Could not record activity:', error.message);
    }

    await mirrorActivityToFirestore(user, {
        action,
        gameId: payload.gameId,
        gameTitle: payload.gameTitle,
        createdAt: entry ? entry.createdAt : new Date()
    });

    return entry;
};

const requireAuth = async (req, res, next) => {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;

        if (!token) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (isTokenRevoked(token)) {
            return res.status(401).json({ message: 'Session ended. Please sign in again.' });
        }

        const payload = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(payload.id);

        if (!user) {
            return res.status(401).json({ message: 'Account no longer exists' });
        }

        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Session expired. Please sign in again.' });
    }
};

const makeGuestUsername = () => {
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `Guest ${suffix}`;
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (req, res) => {
    const firestoreConnected = Boolean(getFirestore());
    res.status(200).json({
        status: 'ok',
        database: mongoose.connection.readyState === 1,
        firebase: Boolean(firebaseApp),
        firestore: firestoreStatus,
        firestoreConnected
    });
});

app.get('/config/firebase', (req, res) => {
    const config = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID
    };

    Object.keys(config).forEach((key) => {
        if (!config[key]) {
            delete config[key];
        }
    });

    if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
        return res.status(503).json({ message: 'Firebase web config is not configured on the server' });
    }

    res.status(200).json({ config });
});

app.post('/signup', async (req, res) => {
    try {
        const username = String(req.body.username || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        if (username.length < 2 || username.length > 30) {
            return res.status(400).json({ message: 'Username must be between 2 and 30 characters' });
        }

        if (!EMAIL_PATTERN.test(email)) {
            return res.status(400).json({ message: 'Please enter a valid email address' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'An account with this email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const newUser = new User({ username, password: hashedPassword, email, provider: 'password' });
        await newUser.save();
        await logActivity(newUser, 'signup');
        await mirrorUserToFirestore(newUser);

        res.status(201).json({
            message: 'User registered successfully',
            token: createToken(newUser),
            user: publicUser(newUser)
        });
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(400).json({ message: 'An account with this email already exists' });
        }
        console.log(error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/login', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        if (!EMAIL_PATTERN.test(email) || !password) {
            return res.status(400).json({ message: 'Please enter your email and password' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const token = createToken(user);
        await logActivity(user, 'login');
        await mirrorUserToFirestore(user, { lastLoginAt: new Date() });

        res.status(200).json({ message: 'Login successful', token, user: publicUser(user) });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/auth/guest', async (req, res) => {
    try {
        const suffix = Math.random().toString(36).slice(2, 8);
        const username = makeGuestUsername();
        const email = `guest-${suffix}-${Date.now().toString(36)}@funville.local`;
        const password = await bcrypt.hash(`guest-${Date.now()}-${suffix}`, BCRYPT_ROUNDS);

        const user = new User({ username, email, password, provider: 'guest' });
        await user.save();
        await logActivity(user, 'signup');
        await mirrorUserToFirestore(user);

        res.status(201).json({
            message: 'Guest session started',
            token: createToken(user),
            user: publicUser(user)
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Could not start a guest session. Please try again.' });
    }
});

app.post('/auth/google', async (req, res) => {
    try {
        if (!firebaseApp) {
            return res.status(503).json({ message: 'Google sign-in is not configured on the server' });
        }

        const idToken = String(req.body.idToken || '').trim();
        if (!idToken) {
            return res.status(400).json({ message: 'Google sign-in token is required' });
        }

        const decodedToken = await getAuth(firebaseApp).verifyIdToken(idToken);
        const email = String(decodedToken.email || '').trim().toLowerCase();
        const name = String(decodedToken.name || decodedToken.email || '').trim();
        const picture = decodedToken.picture || null;
        const uid = decodedToken.uid;

        if (!email || !EMAIL_PATTERN.test(email)) {
            return res.status(400).json({ message: 'A valid Google email address is required' });
        }

        let user = await User.findOne({ email });
        let isNewUser = false;

        if (!user) {
            isNewUser = true;
            const baseUsername = (name || email.split('@')[0]).replace(/[^a-zA-Z0-9]+/g, ' ').trim();
            const username = baseUsername.length >= 2
                ? baseUsername.slice(0, 30)
                : `player${Math.floor(Math.random() * 100000)}`;
            const randomPassword = await bcrypt.hash(uid + Date.now().toString(), BCRYPT_ROUNDS);
            user = new User({
                username,
                email,
                password: randomPassword,
                provider: 'google',
                firebaseUid: uid,
                picture: picture || ''
            });
            await user.save();
            await logActivity(user, 'signup');
        } else {
            user.provider = 'google';
            user.firebaseUid = uid;
            if (picture) {
                user.picture = picture;
            }
            await user.save();
        }

        await logActivity(user, 'login');
        await mirrorUserToFirestore(user, {
            provider: 'google',
            firebaseUid: uid,
            picture: picture || user.picture || null,
            lastLoginAt: new Date()
        });

        res.status(200).json({
            message: isNewUser ? 'Account created and signed in with Google' : 'Signed in with Google',
            token: createToken(user),
            user: publicUser(user),
            picture
        });
    } catch (error) {
        console.log(error);
        return res.status(401).json({ message: 'Google sign-in failed. Please try again.' });
    }
});

app.get('/me', requireAuth, (req, res) => {
    res.status(200).json({ user: publicUser(req.user) });
});

app.post('/logout', requireAuth, async (req, res) => {
    const decoded = jwt.decode(req.token) || {};
    const expiresAt = decoded.exp ? decoded.exp * 1000 : Date.now() + 3600000;
    revokedTokens.set(req.token, expiresAt);
    await logActivity(req.user, 'logout');
    res.status(200).json({ message: 'Logged out successfully' });
});

app.put('/me/favorites', requireAuth, async (req, res) => {
    try {
        const gameId = String(req.body.gameId || '').trim();
        const gameTitle = cleanGameTitle(req.body.gameTitle);
        const favorite = req.body.favorite !== false;

        if (!GAME_ID_PATTERN.test(gameId)) {
            return res.status(400).json({ message: 'Invalid game' });
        }

        const update = favorite
            ? { $addToSet: { favorites: gameId } }
            : { $pull: { favorites: gameId } };

        const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
        await logActivity(req.user, favorite ? 'favorite_add' : 'favorite_remove', { gameId, gameTitle });
        await mirrorUserToFirestore(user);

        res.status(200).json({
            message: favorite ? 'Added to favorites' : 'Removed from favorites',
            favorites: user.favorites
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Could not update favorites' });
    }
});

app.post('/me/activity', requireAuth, async (req, res) => {
    try {
        const gameId = String(req.body.gameId || '').trim();
        const gameTitle = cleanGameTitle(req.body.gameTitle);

        if (!GAME_ID_PATTERN.test(gameId)) {
            return res.status(400).json({ message: 'Invalid game' });
        }

        const playedAt = new Date();
        const user = await User.findById(req.user._id);
        const previous = (user.recentlyPlayed || []).filter((item) => item.gameId !== gameId);
        user.recentlyPlayed = [{ gameId, playedAt }, ...previous].slice(0, 8);
        await user.save();
        await logActivity(req.user, 'play', { gameId, gameTitle });
        await mirrorUserToFirestore(user);

        res.status(200).json({ message: 'Activity saved', recentlyPlayed: publicUser(user).recentlyPlayed });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Could not save activity' });
    }
});

app.get('/me/activity', requireAuth, async (req, res) => {
    try {
        const requested = Number.parseInt(req.query.limit, 10) || 30;
        const limit = Math.min(Math.max(requested, 1), ACTIVITY_HISTORY_LIMIT);
        const activity = await Activity.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        res.status(200).json({
            activity: activity.map((entry) => ({
                id: entry._id,
                action: entry.action,
                gameId: entry.gameId || null,
                gameTitle: entry.gameTitle || null,
                createdAt: entry.createdAt
            }))
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Could not load activity' });
    }
});

const PUBLIC_ROOT = path.join(__dirname, '..');
const BLOCKED_TOP_LEVEL = new Set(['server', 'node_modules', '.git']);
const BLOCKED_FILES = new Set(['serve.py', 'package.json', 'package-lock.json']);

app.use((req, res, next) => {
    let decodedPath;
    try {
        decodedPath = decodeURIComponent(req.path);
    } catch (error) {
        return res.status(400).json({ message: 'Bad request' });
    }

    const segments = decodedPath.split('/').filter(Boolean);
    if (!segments.length) {
        return next();
    }
    const first = segments[0].toLowerCase();
    if (
        segments.some((segment) => segment.startsWith('.')) ||
        BLOCKED_TOP_LEVEL.has(first) ||
        BLOCKED_FILES.has(first)
    ) {
        return res.status(404).json({ message: 'Not found' });
    }
    next();
});

app.use(express.static(PUBLIC_ROOT, { index: 'index.html', dotfiles: 'deny' }));

app.use((req, res) => {
    res.status(404).json({ message: 'Not found' });
});

app.use((error, req, res, next) => {
    console.log(error);
    res.status(500).json({ message: 'Server error' });
});

connectToDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Could not start server without a database connection:', error.message);
        process.exit(1);
    });
