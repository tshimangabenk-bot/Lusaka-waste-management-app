// Central API configuration — edit this one file to point at staging or production.
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'   // local dev
  : window.location.origin + '/api'; // same-origin production deployment
