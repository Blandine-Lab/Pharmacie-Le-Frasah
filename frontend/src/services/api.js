import axios from 'axios';

// URL de l'API : lit VITE_API_URL du .env
// Le .env contient déjà le suffixe /api → baseURL inclut /api
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

console.log('🔍 API_URL =', API_URL);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur : ajoute automatiquement le token JWT à chaque requête
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;