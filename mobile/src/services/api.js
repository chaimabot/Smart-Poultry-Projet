import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/config';

const api = axios.create({
    baseURL: API_URL,
    timeout: 10000, // 10 secondes maximum
    headers: {
        'Content-Type': 'application/json',
    },
});

// Intercepteur pour ajouter le token JWT à chaque requête
api.interceptors.request.use(
    async (config) => {
        const token = await AsyncStorage.getItem('userToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default api;
