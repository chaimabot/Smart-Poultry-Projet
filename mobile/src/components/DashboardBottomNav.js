import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function DashboardBottomNav({ navigation, alertCount = 0 }) {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[
      styles.navContainer,
      { paddingBottom: insets.bottom > 0 ? insets.bottom : 10 }
    ]}>
      <View style={styles.navItems}>
        <TouchableOpacity 
          style={styles.navItem} 
          onPress={() => navigation && navigation.navigate('Dashboard')}
        >
          <Ionicons name="grid" size={24} color="#22C55E" />
          <Text style={[styles.navText, { color: "#22C55E" }]}>Accueil</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="pulse-outline" size={24} color="#94A3B8" />
          <Text style={styles.navText}>Monitor</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="settings-outline" size={24} color="#94A3B8" />
          <Text style={styles.navText}>Commandes</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.navItem} 
          onPress={() => navigation && navigation.navigate('Profile')}
        >
          <Ionicons name="person-outline" size={24} color="#94A3B8" />
          <Text style={styles.navText}>Profil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navContainer: {
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    minHeight: 70,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  navItems: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
  },
  navText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    marginTop: 4,
  }
});
