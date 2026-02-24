import React, { createContext, useContext, useState } from 'react';

// Define the color palette
export const themeColors = {
  // Brand Colors
  primary: "#22C55E", // Green from mockup
  primaryDark: "#16A34A",
  primaryLight: "#DCFCE7",
  
  // Neutral Colors (Light Theme)
  backgroundLight: "#F8FAF9",
  cardLight: "#FFFFFF",
  textMainLight: "#1E293B",
  textSubLight: "#64748B",
  borderLight: "#F1F5F9",
  
  // Neutral Colors (Dark Theme)
  backgroundDark: "#221a10", // Deep Brown/Black from reference
  cardDark: "#2d2419", // Adjusted darker shade
  textMainDark: "#F8FAF8",
  textSubDark: "#94A3B8",
  borderDark: "#3d3224",
  
  // Accents
  success: "#10b981", 
  warning: "#f59e0b",
  danger: "#e11d48",
  info: "#3B82F6",
  accentGreen: "#10B981",
  
  // Brand specifics
  brandBlue: "#0EA5E9",
  brandGreen: "#22C55E",
  brandOrange: "#F97316",
  
  // Utilitaires
  slate950: "#020617",
  slate900: "#0F172A",
  slate800: "#1E293B",
  slate700: "#334155",
  slate600: "#475569",
  slate500: "#64748B",
  slate400: "#94A3B8",
  slate300: "#CBD5E1",
  slate200: "#E2E8F0",
  slate100: "#F1F5F9",
  slate50: "#F8FAFC",
  white: "#FFFFFF",
  black: "#000000",
  
  // Glassmorphism overlays
  glassLight: "rgba(255, 255, 255, 0.7)",
  glassDark: "rgba(15, 23, 42, 0.7)",
  glassBorder: "rgba(255, 255, 255, 0.1)",
};

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(false);

  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  const theme = {
    darkMode,
    toggleDarkMode,
    colors: themeColors,
  };

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
