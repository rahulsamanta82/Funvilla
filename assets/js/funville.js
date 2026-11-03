'use strict';

/**
 * Funvilla shared frontend module.
 * Handles API calls, authentication UI, profile dropdown, game catalogue and
 * game activity. The backend remains the source of truth for user data.
 */
(function () {
  const API_BASE = window.FUNVILLE_API_BASE || 'http://localhost:3000';
  const TOKEN_KEY = 'token';
  const USER_KEY = 'funville_user';

  let firebaseConfigPromise = null;

  const GAMES = [
    {
      id: 'breakout',
      title: 'Bounce and Break!',
      category: 'Arcade',
      path: 'assets/games  and  Files/1Breakout-Game/index.html',
      image: 'assets/images/team-logo-1.png',
      description: 'Smash every brick, keep the ball alive and chase a new high score.'
    },
    {
      id: 'snake',
      title: 'Snake Adventure',
      category: 'Arcade',
      path: 'assets/games  and  Files/2Snake Game/index.html',
      image: 'assets/images/team-logo-2.png',
      description: 'Guide the snake, collect food and grow without hitting the walls.'
    },
    {
      id: 'shadow-run',
      title: 'Run the Shadows',
      category: 'Action',
      path: 'assets/games  and  Files/3Shadow run game/index.html',
      image: 'assets/images/team-logo-3.png',
      description: 'A fast side-scrolling runner built for quick reflexes.'
    },
    {
      id: 'rubiks-cube',
      title: 'Crack the Cube',
      category: 'Puzzle',
      path: "assets/games  and  Files/4Rubik's Cube/index.html",
      image: 'assets/images/team-logo-4.png',
      description: 'A digital twist on the classic cube puzzle.'
    },
    {
      id: '2048',
      title: 'Reach 2048!',
      category: 'Puzzle',
      path: 'assets/games  and  Files/5_2048 Game/index.html',
      image: 'assets/images/team-logo-5.png',
      description: 'Slide, merge and plan ahead until you reach 2048.'
    },
    {
      id: 'tic-tac-toe',
      title: 'Tic-Tac-Toe Challenge',
      category: 'Strategy',
      path: 'assets/games  and  Files/6Tic-Tac-Toe/index.html',
      image: 'assets/images/team-logo-6.png',
      description: 'Classic three-in-a-row against a friend or the computer.'
    },
    {
      id: 'crossy-road',
      title: "Traffic's Match!",
      category: 'Action',
      path: 'assets/games  and  Files/7Crossy-Road-Game/index.html',
      image: 'assets/images/team-logo-3.png',
      description: 'Cross busy lanes and time every move perfectly.'
    },
    {
      id: 'fruit-slicer',
      title: 'Fruit Slicer',
      category: 'Action',
      path: 'assets/games  and  Files/8Fruit-Slicer-Game/index.html',
      image: 'assets/images/team-logo-6.png',
      description: 'Slice fruit, avoid the bombs and chain quick combos.'
    },
    {
      id: 'password-generator',
      title: 'Password Generator',
      category: 'Tools',
      path: 'assets/games  and  Files/c1_Password Generator/dist/index.html',
      image: 'assets/images/news-1.jpg',
      description: 'Create strong, custom passwords for your accounts.'
    },
    {
      id: 'solar-system',
      title: 'Solar System Explorer',
      category: 'Learning',
      path: 'assets/games  and  Files/c2_Solar system explorer/template.html',
      image: 'assets/images/news-2.jpg',
      description: 'Explore planets and discover how the solar system fits together.'
    },
    {
      id: 'meme-generator',
      title: 'Meme Generator',
      category: 'Creative',
      path: 'assets/games  and  Files/c3_Meme-Founder-main/index.html',
      image: 'assets/images/news-3.jpg',
      description: 'Make your own memes with safe, family-friendly content.'
    },
    {
      id: 'king-chess',
      title: "King's Chess",
      category: 'Strategy',
      path: 'assets/games  and  Files/KingChess/index.html',
      image: 'assets/games  and  Files/KingChess/pictures/Logo.jpg',
      description: 'Command your pieces, outthink the AI and battle to checkmate across three difficulty levels.'
    },
    {
      id: 'rock-paper-scissors',
      title: 'Rock Paper Scissors',
      category: 'Arcade',
      path: 'assets/games  and  Files/Rock Paper Scissors/index.html',
      image: 'assets/games  and  Files/Rock Paper Scissors/Images/logo.png',
      description: 'Pick rock, paper or scissors and outplay the computer in fast, best-of rounds.'
    },
    {
      id: 'neon-tic-tac-toe',
      title: 'Neon Tic-Tac-Toe',
      category: 'Strategy',
      path: 'assets/games  and  Files/TicTacToe/index.html',
      image: 'assets/games  and  Files/TicTacToe/pictures/logo.jpg',
      description: 'Glowing neon grids and smart bots in a three-in-a-row duel against an unbeatable AI.'
    },
    {
      id: 'kingdom-defense',
      title: 'Kingdom Defense',
      category: 'Strategy',
      path: 'assets/games  and  Files/TowerDefense/index.html',
      image: 'assets/games  and  Files/TowerDefense/pictures/Logo.png',
      description: 'Build and upgrade your towers to defend the castle from endless waves of monsters.'
    },
    {
      id: 'weird-t-rex',
      title: 'Weird T-Rex',
      category: 'Action',
      path: 'assets/games  and  Files/Wierd T-rex/index.html',
      image: 'assets/games  and  Files/Wierd T-rex/logo.png',
      description: 'Run, jump and dodge in a quirky retro dino dash packed with high scores and upgrades.'
    }
  ];

  let currentUser = readStoredUser();
  let toastTimer = null;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function readStoredUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function storeUser(user) {
    currentUser = user;
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }

  function storeSession(token, user) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    }
    storeUser(user || null);
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    storeUser(null);
  }

  async function apiRequest(path, options) {
    const config = Object.assign({}, options || {});
    const headers = Object.assign({ 'Content-Type': 'application/json' }, config.headers || {});
    const token = getToken();

    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }

    const response = await fetch(API_BASE + path, Object.assign({}, config, { headers: headers }));
    const text = await response.text();
    let data = {};

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = { message: text };
      }
    }

    if (!response.ok) {
      const requestError = new Error(data.message || 'Something went wrong. Please try again.');
      requestError.status = response.status;
      throw requestError;
    }

    return data;
  }

  function login(email, password) {
    return apiRequest('/login', {
      method: 'POST',
      body: JSON.stringify({ email: email, password: password })
    });
  }

  function signup(username, email, password) {
    return apiRequest('/signup', {
      method: 'POST',
      body: JSON.stringify({ username: username, email: email, password: password })
    });
  }

  function guestLogin() {
    return apiRequest('/auth/guest', { method: 'POST' });
  }

  function googleSignIn(idToken) {
    return apiRequest('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken: idToken })
    });
  }

  function loadFirebaseConfig() {
    if (!firebaseConfigPromise) {
      firebaseConfigPromise = apiRequest('/config/firebase').then(function (data) {
        return data.config;
      }).catch(function (error) {
        firebaseConfigPromise = null;
        throw error;
      });
    }
    return firebaseConfigPromise;
  }

  async function fetchMe() {
    const data = await apiRequest('/me');
    if (data.user) {
      storeUser(data.user);
    }
    return data.user;
  }

  async function logout() {
    try {
      if (getToken()) {
        await apiRequest('/logout', { method: 'POST' });
      }
    } catch (error) {
      // The local session is still cleared even if the server is unreachable.
    } finally {
      clearSession();
      window.location.replace('index.html');
    }
  }

  async function setFavorite(gameId, favorite) {
    const game = gameById(gameId);
    const data = await apiRequest('/me/favorites', {
      method: 'PUT',
      body: JSON.stringify({
        gameId: gameId,
        favorite: favorite,
        gameTitle: game ? game.title : undefined
      })
    });

    if (currentUser) {
      currentUser.favorites = data.favorites || [];
      storeUser(currentUser);
    }
    syncFavoriteButtons();
    return data.favorites || [];
  }

  function recordActivity(gameId, gameTitle) {
    if (!getToken()) {
      return;
    }

    const game = gameById(gameId);
    apiRequest('/me/activity', {
      method: 'POST',
      body: JSON.stringify({
        gameId: gameId,
        gameTitle: gameTitle || (game ? game.title : undefined)
      }),
      keepalive: true
    }).then(function (data) {
      if (currentUser && data.recentlyPlayed) {
        currentUser.recentlyPlayed = data.recentlyPlayed;
        storeUser(currentUser);
      }
    }).catch(function () {
      // Activity tracking must never block a game from opening.
    });
  }

  function isFavorite(gameId) {
    return Boolean(currentUser && (currentUser.favorites || []).indexOf(gameId) !== -1);
  }

  function initials(name) {
    const clean = String(name || 'Player').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map(function (part) {
      return part.charAt(0);
    }).join('').toUpperCase() || 'F';
  }

  function initialsFor(user) {
    return initials(user && user.username);
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(function (element) {
      element.textContent = value;
    });
  }

  function setGuestView() {
    document.querySelectorAll('[data-auth-guest]').forEach(function (element) {
      element.hidden = false;
    });
    document.querySelectorAll('[data-auth-user]').forEach(function (element) {
      element.hidden = true;
    });
    syncFavoriteButtons();
  }

  function setUserView(user) {
    const avatarText = initialsFor(user);
    document.querySelectorAll('[data-auth-guest]').forEach(function (element) {
      element.hidden = true;
    });
    document.querySelectorAll('[data-auth-user]').forEach(function (element) {
      element.hidden = false;
    });
    setText('[data-user-name]', user.username || 'Player');
    setText('[data-user-email]', user.email || '');
    setText('[data-user-avatar], [data-user-initials]', avatarText);
    syncFavoriteButtons();
  }

  function syncFavoriteButtons() {
    document.querySelectorAll('[data-favorite]').forEach(function (button) {
      const gameId = button.getAttribute('data-favorite');
      const active = isFavorite(gameId);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', (active ? 'Remove ' : 'Add ') + (gameLabel(gameId) || 'game') + (active ? ' from favorites' : ' to favorites'));

      const icon = button.querySelector('ion-icon');
      if (icon) {
        icon.setAttribute('name', active ? 'heart' : 'heart-outline');
      }
    });
  }

  function gameById(gameId) {
    for (let i = 0; i < GAMES.length; i++) {
      if (GAMES[i].id === gameId) {
        return GAMES[i];
      }
    }
    return null;
  }

  function gameLabel(gameId) {
    const game = gameById(gameId);
    return game ? game.title : '';
  }

  function gameByPath(path) {
    const normalized = normalizePath(path);
    for (let i = 0; i < GAMES.length; i++) {
      if (normalizePath(GAMES[i].path) === normalized) {
        return GAMES[i];
      }
    }
    return null;
  }

  function normalizePath(path) {
    return decodeURI(String(path || ''))
      .trim()
      .replace(/^\.\//, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }

  function showToast(message, type) {
    let container = document.querySelector('[data-toast-container]');

    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('data-toast-container', '');
      document.body.appendChild(container);
    }

    container.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.textContent = message;
    container.appendChild(toast);

    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.add('toast-hide');
      setTimeout(function () {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 250);
    }, 3500);
  }

  function redirectTarget() {
    const params = new URLSearchParams(window.location.search);
    const target = params.get('redirect');
    return target && /^[a-z0-9-]+\.html$/i.test(target) ? target : 'main.html';
  }

  function toggleFavorite(gameId) {
    if (!getToken()) {
      window.location.href = 'index.html?redirect=' + encodeURIComponent('main.html');
      return Promise.resolve();
    }

    const shouldAdd = !isFavorite(gameId);
    return setFavorite(gameId, shouldAdd).then(function () {
      showToast(shouldAdd ? 'Added to your favorites' : 'Removed from your favorites', 'success');
    }).catch(function (error) {
      if (error.status === 401) {
        clearSession();
        setGuestView();
        showToast('Your session ended. Please sign in again.', 'error');
      } else {
        showToast(error.message, 'error');
      }
    });
  }

  function safeGameCard(game, options) {
    const article = document.createElement('article');
    article.className = 'game-card';
    article.setAttribute('data-game-card', '');
    article.setAttribute('data-game-id', game.id);

    const media = document.createElement('a');
    media.className = 'game-card-media' + (game.image.indexOf('news-') !== -1 ? ' game-card-media-cover' : '');
    media.href = game.path;
    media.setAttribute('aria-label', 'Play ' + game.title);

    const image = document.createElement('img');
    image.src = game.image;
    image.alt = '';
    image.loading = 'lazy';
    image.width = 320;
    image.height = 220;
    media.appendChild(image);

    const badge = document.createElement('span');
    badge.className = 'game-card-badge';
    badge.textContent = 'Free';
    media.appendChild(badge);
    article.appendChild(media);

    const body = document.createElement('div');
    body.className = 'game-card-body';

    const top = document.createElement('div');
    top.className = 'game-card-top';
    const category = document.createElement('span');
    category.className = 'game-card-category';
    category.textContent = game.category;
    top.appendChild(category);

    const favorite = document.createElement('button');
    favorite.type = 'button';
    favorite.className = 'game-fav';
    favorite.setAttribute('data-favorite', game.id);
    favorite.setAttribute('aria-pressed', 'false');
    favorite.setAttribute('aria-label', 'Add ' + game.title + ' to favorites');
    const heart = document.createElement('ion-icon');
    heart.setAttribute('name', 'heart-outline');
    favorite.appendChild(heart);
    top.appendChild(favorite);
    body.appendChild(top);

    const title = document.createElement('h3');
    title.className = 'game-card-title';
    const titleLink = document.createElement('a');
    titleLink.href = game.path;
    titleLink.textContent = game.title;
    title.appendChild(titleLink);
    body.appendChild(title);

    const description = document.createElement('p');
    description.className = 'game-card-text';
    description.textContent = game.description;
    body.appendChild(description);

    const play = document.createElement('a');
    play.className = 'game-play';
    play.href = game.path;
    play.innerHTML = 'Play now <ion-icon name="arrow-forward-outline" aria-hidden="true"></ion-icon>';
    body.appendChild(play);

    article.appendChild(body);

    if (options && options.removeFavorite) {
      favorite.className = 'game-fav game-fav-remove active';
      favorite.setAttribute('aria-label', 'Remove ' + game.title + ' from favorites');
      const removeIcon = favorite.querySelector('ion-icon');
      if (removeIcon) {
        removeIcon.setAttribute('name', 'close');
      }
    }

    return article;
  }

  function initHeader() {
    const hasHeader = document.querySelector('[data-auth-guest], [data-auth-user]');
    if (!hasHeader) {
      return Promise.resolve(null);
    }

    const trigger = document.querySelector('[data-profile-trigger]');
    const menu = document.querySelector('[data-profile-menu]');

    function closeMenu() {
      if (!menu || !trigger) {
        return;
      }
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    if (trigger && menu) {
      trigger.addEventListener('click', function (event) {
        event.stopPropagation();
        const isOpen = !menu.hidden;
        menu.hidden = isOpen;
        trigger.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      });

      document.addEventListener('click', function (event) {
        if (!menu.hidden && !menu.contains(event.target) && !trigger.contains(event.target)) {
          closeMenu();
        }
      });

      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          closeMenu();
          trigger.focus();
        }
      });

      menu.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', closeMenu);
      });
    }

    document.querySelectorAll('[data-logout]').forEach(function (button) {
      button.addEventListener('click', function () {
        button.disabled = true;
        button.classList.add('is-loading');
        logout();
      });
    });

    if (!getToken()) {
      setGuestView();
      return Promise.resolve(null);
    }

    if (currentUser) {
      setUserView(currentUser);
    }

    return fetchMe().then(function (user) {
      setUserView(user);
      return user;
    }).catch(function (error) {
      if (error.status === 401) {
        clearSession();
      }
      setGuestView();
      return null;
    });
  }

  function initAuthPage() {
    if (!document.body.hasAttribute('data-auth-page')) {
      return;
    }

    const loginForm = document.getElementById('login-in');
    const signupForm = document.getElementById('login-up');
    const loginMessage = document.querySelector('[data-login-message]');
    const signupMessage = document.querySelector('[data-signup-message]');

    if (!loginForm || !signupForm) {
      return;
    }

    function setMessage(element, message, type) {
      if (!element) {
        return;
      }
      element.textContent = message || '';
      element.className = 'auth-message' + (type ? ' auth-message-' + type : '');
      element.hidden = !message;
    }

    function setBusy(form, busy, label) {
      const button = form.querySelector('button[type="submit"]');
      if (!button) {
        return;
      }
      if (busy) {
        button.dataset.label = button.textContent;
        button.textContent = label;
      } else if (button.dataset.label) {
        button.textContent = button.dataset.label;
      }
      button.disabled = busy;
    }

    if (window.location.hash === '#signup') {
      loginForm.classList.remove('block');
      loginForm.classList.add('none');
      signupForm.classList.remove('none');
      signupForm.classList.add('block');
    }

    loginForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const email = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      setMessage(loginMessage, '', '');

      if (!email || !password) {
        setMessage(loginMessage, 'Enter your email and password to continue.', 'error');
        return;
      }

      setBusy(loginForm, true, 'Signing in...');
      login(email, password).then(function (data) {
        storeSession(data.token, data.user);
        window.location.href = redirectTarget();
      }).catch(function (error) {
        setMessage(loginMessage, error.message, 'error');
        setBusy(loginForm, false);
      });
    });

    signupForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const username = document.getElementById('signup-username').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      setMessage(signupMessage, '', '');

      if (username.length < 2) {
        setMessage(signupMessage, 'Choose a username with at least 2 characters.', 'error');
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setMessage(signupMessage, 'Enter a valid email address.', 'error');
        return;
      }

      if (password.length < 6) {
        setMessage(signupMessage, 'Use a password with at least 6 characters.', 'error');
        return;
      }

      setBusy(signupForm, true, 'Creating account...');
      signup(username, email, password).then(function (data) {
        storeSession(data.token, data.user);
        window.location.href = redirectTarget();
      }).catch(function (error) {
        setMessage(signupMessage, error.message, 'error');
        setBusy(signupForm, false);
      });
    });

    document.querySelectorAll('[data-password-toggle]').forEach(function (button) {
      button.addEventListener('click', function () {
        const input = document.getElementById(button.getAttribute('data-password-toggle'));
        if (!input) {
          return;
        }
        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
        const ionIcon = button.querySelector('ion-icon');
        if (ionIcon) {
          ionIcon.setAttribute('name', visible ? 'eye-outline' : 'eye-off-outline');
        }
        const boxIcon = button.querySelector('i');
        if (boxIcon) {
          boxIcon.className = visible ? 'bx bx-show' : 'bx bx-hide';
        }
      });
    });

    const forgot = document.querySelector('[data-forgot-password]');
    if (forgot) {
      forgot.addEventListener('click', function (event) {
        event.preventDefault();
        setMessage(loginMessage, 'Password reset is not available yet. Please contact the Funvilla team for help.', 'info');
      });
    }

    document.querySelectorAll('.login__social-icon').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        setMessage(loginMessage, 'Google sign-in is available below.', 'info');
      });
    });

    function googleErrorMessage(error) {
      const code = error && error.code;
      switch (code) {
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
          return 'Google sign-in was cancelled.';
        case 'auth/popup-blocked':
          return 'Your browser blocked the Google popup. Allow popups for this site and try again.';
        case 'auth/network-request-failed':
          return 'Network error while contacting Google. Check your connection and try again.';
        case 'auth/unauthorized-domain':
          return 'This domain is not authorised for Google sign-in in Firebase.';
        default:
          return (error && error.message) || 'Google sign-in failed. Please try again.';
      }
    }

    const guestButton = document.getElementById('guest-login-btn');
    if (guestButton) {
      guestButton.addEventListener('click', function () {
        setMessage(loginMessage, '', '');
        guestButton.disabled = true;
        const label = guestButton.innerHTML;
        guestButton.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Starting guest session...";

        guestLogin().then(function (data) {
          storeSession(data.token, data.user);
          window.location.href = redirectTarget();
        }).catch(function (error) {
          setMessage(loginMessage, error.message, 'error');
          guestButton.disabled = false;
          guestButton.innerHTML = label;
        });
      });
    }

    const googleButton = document.getElementById('google-login-btn');
    if (googleButton && window.firebase) {
      googleButton.addEventListener('click', function () {
        setMessage(loginMessage, '', '');
        googleButton.disabled = true;
        const label = googleButton.innerHTML;
        googleButton.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Connecting to Google...";

        loadFirebaseConfig().then(function (config) {
          if (!firebase.apps.length) {
            firebase.initializeApp(config);
          }

          const provider = new firebase.auth.GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
          return firebase.auth().signInWithPopup(provider);
        }).then(function (result) {
          return result.user.getIdToken();
        }).then(function (idToken) {
          return googleSignIn(idToken);
        }).then(function (data) {
          storeSession(data.token, data.user);
          window.location.href = redirectTarget();
        }).catch(function (error) {
          setMessage(loginMessage, googleErrorMessage(error), 'error');
          googleButton.disabled = false;
          googleButton.innerHTML = label;
        });
      });
    } else if (googleButton) {
      googleButton.addEventListener('click', function (event) {
        event.preventDefault();
        setMessage(loginMessage, 'Google sign-in is not available right now. Please use email or guest login.', 'error');
      });
    }

    if (getToken()) {
      fetchMe().then(function () {
        window.location.replace(redirectTarget());
      }).catch(function () {
        clearSession();
      });
    }
  }

  function initGameBrowser() {
    const grid = document.querySelector('[data-game-grid]');
    if (!grid) {
      return;
    }

    const search = document.querySelector('[data-game-search]');
    const filters = document.querySelector('[data-game-filters]');
    const empty = document.querySelector('[data-game-empty]');
    const emptyText = document.querySelector('[data-game-empty-text]');
    let activeCategory = 'all';
    let favoritesOnly = false;

    const categories = [];
    GAMES.forEach(function (game) {
      if (categories.indexOf(game.category) === -1) {
        categories.push(game.category);
      }
    });

    if (filters) {
      filters.innerHTML = '';
      ['all'].concat(categories).forEach(function (category) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'filter-chip' + (category === 'all' ? ' active' : '');
        chip.setAttribute('data-category', category);
        chip.textContent = category === 'all' ? 'All games' : category;
        filters.appendChild(chip);
      });

      const favoriteChip = document.createElement('button');
      favoriteChip.type = 'button';
      favoriteChip.className = 'filter-chip filter-chip-favorites';
      favoriteChip.setAttribute('data-favorites-filter', '');
      favoriteChip.innerHTML = '<ion-icon name="heart-outline" aria-hidden="true"></ion-icon> Favorites';
      filters.appendChild(favoriteChip);

      filters.addEventListener('click', function (event) {
        const categoryButton = event.target.closest('[data-category]');
        const favoriteButton = event.target.closest('[data-favorites-filter]');

        if (categoryButton) {
          activeCategory = categoryButton.getAttribute('data-category');
          filters.querySelectorAll('[data-category]').forEach(function (button) {
            button.classList.toggle('active', button === categoryButton);
          });
          applyFilters();
        }

        if (favoriteButton) {
          if (!getToken()) {
            showToast('Sign in to keep favorites across devices.', 'info');
            window.location.href = 'index.html?redirect=main.html';
            return;
          }
          favoritesOnly = !favoritesOnly;
          favoriteButton.classList.toggle('active', favoritesOnly);
          applyFilters();
        }
      });
    }

    GAMES.forEach(function (game) {
      grid.appendChild(safeGameCard(game));
    });

    grid.addEventListener('click', function (event) {
      const favoriteButton = event.target.closest('[data-favorite]');
      if (favoriteButton) {
        event.preventDefault();
        toggleFavorite(favoriteButton.getAttribute('data-favorite'));
        return;
      }

      const link = event.target.closest('a[href]');
      if (link) {
        const card = link.closest('[data-game-id]');
        if (card) {
          const game = gameById(card.getAttribute('data-game-id'));
          recordActivity(card.getAttribute('data-game-id'), game ? game.title : undefined);
        }
      }
    });

    function applyFilters() {
      const query = search ? search.value.trim().toLowerCase() : '';
      let visibleCount = 0;

      grid.querySelectorAll('[data-game-card]').forEach(function (card) {
        const game = gameById(card.getAttribute('data-game-id'));
        if (!game) {
          return;
        }

        const matchesQuery = !query || game.title.toLowerCase().indexOf(query) !== -1 || game.category.toLowerCase().indexOf(query) !== -1;
        const matchesCategory = activeCategory === 'all' || game.category === activeCategory;
        const matchesFavorite = !favoritesOnly || isFavorite(game.id);
        const visible = matchesQuery && matchesCategory && matchesFavorite;

        card.hidden = !visible;
        if (visible) {
          visibleCount += 1;
        }
      });

      if (empty) {
        empty.hidden = visibleCount !== 0;
      }

      if (emptyText) {
        emptyText.textContent = favoritesOnly
          ? 'No favorites yet. Tap the heart on a game to save it here.'
          : 'No games match your search. Try a different name or category.';
      }
    }

    if (search) {
      search.addEventListener('input', applyFilters);
    }

    applyFilters();
    syncFavoriteButtons();
  }

  function formatActivityDate(date) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      + ' · '
      + date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function activityDetails(entry) {
    const game = entry.gameId ? gameById(entry.gameId) : null;
    const title = entry.gameTitle || (game ? game.title : 'a game');
    const icon = 'game-controller-outline';

    switch (entry.action) {
      case 'play':
        return { label: 'Played ' + title, meta: game ? game.category : 'Game', icon: icon, game: game };
      case 'favorite_add':
        return { label: 'Saved ' + title + ' to favorites', meta: 'Favorite', icon: 'heart-outline', game: game };
      case 'favorite_remove':
        return { label: 'Removed ' + title + ' from favorites', meta: 'Favorite', icon: 'heart-dislike-outline', game: game };
      case 'login':
        return { label: 'Signed in to Funvilla', meta: 'Account', icon: 'log-in-outline', game: null };
      case 'logout':
        return { label: 'Signed out of Funvilla', meta: 'Account', icon: 'log-out-outline', game: null };
      case 'signup':
        return { label: 'Created your Funvilla account', meta: 'Account', icon: 'person-add-outline', game: null };
      default:
        return { label: 'Account activity', meta: 'Account', icon: 'pulse-outline', game: null };
    }
  }

  function recentAsActivity(user) {
    return (user.recentlyPlayed || []).map(function (item) {
      const game = gameById(item.gameId);
      return {
        action: 'play',
        gameId: item.gameId,
        gameTitle: game ? game.title : null,
        createdAt: item.playedAt
      };
    });
  }

  function renderActivity(entries) {
    const list = document.querySelector('[data-recent-list]');
    const empty = document.querySelector('[data-empty-recent]');
    if (!list) {
      return;
    }

    list.innerHTML = '';
    entries.forEach(function (entry) {
      const details = activityDetails(entry);
      const item = document.createElement('li');
      item.className = 'activity-item';

      const isPlayLink = entry.action === 'play' && details.game;
      const row = document.createElement(isPlayLink ? 'a' : 'div');
      row.className = 'activity-link';

      if (isPlayLink) {
        row.href = details.game.path;
        row.setAttribute('data-game-id', details.game.id);
        row.addEventListener('click', function () {
          recordActivity(details.game.id, details.game.title);
        });
      }

      const avatar = document.createElement('span');
      avatar.className = 'activity-icon';
      avatar.innerHTML = '<ion-icon name="' + details.icon + '" aria-hidden="true"></ion-icon>';
      row.appendChild(avatar);

      const copy = document.createElement('span');
      copy.className = 'activity-copy';
      const label = document.createElement('strong');
      label.textContent = details.label;
      const meta = document.createElement('span');
      const date = entry.createdAt ? new Date(entry.createdAt) : null;
      meta.textContent = details.meta + (date ? ' · ' + formatActivityDate(date) : '');
      copy.appendChild(label);
      copy.appendChild(meta);
      row.appendChild(copy);

      if (isPlayLink) {
        const arrow = document.createElement('ion-icon');
        arrow.setAttribute('name', 'chevron-forward-outline');
        arrow.setAttribute('aria-hidden', 'true');
        row.appendChild(arrow);
      }

      item.appendChild(row);
      list.appendChild(item);
    });

    list.hidden = entries.length === 0;
    if (empty) {
      empty.hidden = entries.length !== 0;
    }
  }

  function loadActivity() {
    if (!getToken()) {
      return;
    }

    apiRequest('/me/activity?limit=50').then(function (data) {
      renderActivity(data.activity || []);
    }).catch(function (error) {
      if (error.status === 401) {
        clearSession();
        window.location.replace('index.html?redirect=profile.html');
      }
    });
  }

  function renderProfile(user) {
    if (!user) {
      return;
    }

    const favorites = (user.favorites || []).map(gameById).filter(Boolean);
    const recent = (user.recentlyPlayed || []).map(function (item) {
      const game = gameById(item.gameId);
      return game ? { game: game, playedAt: item.playedAt } : null;
    }).filter(Boolean);

    setText('[data-user-name]', user.username || 'Player');
    setText('[data-user-email]', user.email || '');
    setText('[data-user-avatar], [data-user-initials]', initialsFor(user));
    setText('[data-stat-favorites]', String(favorites.length));
    setText('[data-stat-recent]', String(recent.length));

    const joined = document.querySelector('[data-user-joined]');
    if (joined && user.createdAt) {
      const date = new Date(user.createdAt);
      joined.textContent = 'Member since ' + date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }

    const favoritesGrid = document.querySelector('[data-favorites-grid]');
    const favoritesEmpty = document.querySelector('[data-empty-favorites]');

    if (favoritesGrid) {
      favoritesGrid.innerHTML = '';
      favorites.forEach(function (game) {
        const card = safeGameCard(game, { removeFavorite: true });
        const removeButton = card.querySelector('[data-favorite]');
        if (removeButton) {
          removeButton.addEventListener('click', function () {
            setFavorite(game.id, false).then(function () {
              showToast('Removed from your favorites', 'success');
              renderProfile(currentUser);
            }).catch(function (error) {
              showToast(error.message, 'error');
            });
          });
        }
        favoritesGrid.appendChild(card);
      });
      favoritesGrid.hidden = favorites.length === 0;
    }

    if (favoritesEmpty) {
      favoritesEmpty.hidden = favorites.length !== 0;
    }

    renderActivity(recentAsActivity(user));

    const profileContent = document.querySelector('[data-profile-content]');
    if (profileContent) {
      profileContent.hidden = false;
    }
  }

  function initProfilePage() {
    if (!document.body.hasAttribute('data-profile-page')) {
      return;
    }

    const loading = document.querySelector('[data-profile-loading]');
    const errorState = document.querySelector('[data-profile-error]');
    const retry = document.querySelector('[data-profile-retry]');

    if (!getToken()) {
      window.location.replace('index.html?redirect=profile.html');
      return;
    }

    if (currentUser) {
      if (loading) {
        loading.hidden = true;
      }
      renderProfile(currentUser);
      loadActivity();
      return;
    }

    function load() {
      if (loading) {
        loading.hidden = false;
      }
      if (errorState) {
        errorState.hidden = true;
      }

      fetchMe().then(function (user) {
        if (loading) {
          loading.hidden = true;
        }
        renderProfile(user);
        loadActivity();
      }).catch(function (error) {
        if (loading) {
          loading.hidden = true;
        }
        if (error.status === 401) {
          clearSession();
          window.location.replace('index.html?redirect=profile.html');
          return;
        }
        if (errorState) {
          errorState.hidden = false;
        }
      });
    }

    if (retry) {
      retry.addEventListener('click', load);
    }

    load();
  }

  window.Funville = {
    api: apiRequest,
    games: GAMES,
    getToken: getToken,
    getUser: function () { return currentUser; },
    isFavorite: isFavorite,
    showToast: showToast,
    recordActivity: recordActivity
  };

  document.addEventListener('DOMContentLoaded', function () {
    initAuthPage();

    document.querySelectorAll('[data-newsletter]').forEach(function (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        showToast('Newsletter signup is not available yet.', 'info');
      });
    });

    if (document.body.hasAttribute('data-auth-page')) {
      return;
    }

    initGameBrowser();

    initHeader().then(function (user) {
      initProfilePage();
      if (user) {
        renderProfile(user);
      }
    });
  });
})();
