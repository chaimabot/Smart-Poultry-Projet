import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const login = async (email, password) => {
    try {
        const response = await api.post('/auth/login', { email, password });
        if (response.data.token) {
            await AsyncStorage.setItem('userToken', response.data.token);
            await AsyncStorage.setItem('userData', JSON.stringify(response.data.user));
        }
        return response.data;
    } catch (error) {
        throw error.response ? error.response.data : { error: 'Erreur réseau ou serveur' };
    }
};

export const register = async (firstName, lastName, email, password, phone) => {
    try {
        const response = await api.post('/auth/register', {
            firstName,
            lastName,
            email,
            password,
            phone
        });
        if (response.data.token) {
            await AsyncStorage.setItem('userToken', response.data.token);
            await AsyncStorage.setItem('userData', JSON.stringify(response.data.user));
        }
        return response.data;
    } catch (error) {
        throw error.response ? error.response.data : { error: 'Erreur réseau ou serveur' };
    }
};

export const getMe = async () => {
    try {
        const response = await api.get('/auth/me');
        return response.data;
    } catch (error) {
        throw error.response ? error.response.data : { error: 'Erreur réseau' };
    }
};

export const getUserData = async () => {
    const data = await AsyncStorage.getItem('userData');
    return data ? JSON.parse(data) : null;
};

export const updateProfile = async (userData) => {
    try {
        const response = await api.put('/auth/updatedetails', userData);
        if (response.data.success) {
            await AsyncStorage.setItem('userData', JSON.stringify(response.data.user));
        }
        return response.data;
    } catch (error) {
        throw error.response ? error.response.data : { error: 'Erreur réseau' };
    }
};

export const updatePassword = async (passwordData) => {
    try {
        const response = await api.put('/auth/updatepassword', passwordData);
        return response.data;
    } catch (error) {
        throw error.response ? error.response.data : { error: 'Erreur réseau' };
    }
};

export const logout = async () => {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('userData');
};

export const checkAuth = async () => {
    const token = await AsyncStorage.getItem('userToken');
    return !!token;
};
