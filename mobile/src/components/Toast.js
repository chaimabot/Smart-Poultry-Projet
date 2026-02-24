import React, { useEffect, useRef } from "react";
import { Animated, Text, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Toast({ message, visible, onHide, type = "success" }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-100)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.sequence([
          Animated.spring(translateY, {
            toValue: 0,
            tension: 100,
            friction: 10,
            useNativeDriver: true,
          }),
          Animated.delay(2500),
          Animated.timing(translateY, {
            toValue: -100,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(2500),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        if (onHide) onHide();
      });
    }
  }, [visible, message, opacity, translateY, onHide]);

  if (!visible) return null;

  const getConfig = () => {
    switch (type) {
      case "error":
        return {
          backgroundColor: "#EF4444",
          icon: "error",
          iconColor: "#FFF",
        };
      case "warning":
        return {
          backgroundColor: "#F59E0B",
          icon: "warning",
          iconColor: "#FFF",
        };
      case "info":
        return {
          backgroundColor: "#3B82F6",
          icon: "info",
          iconColor: "#FFF",
        };
      default:
        return {
          backgroundColor: "#22C55E",
          icon: "check-circle",
          iconColor: "#FFF",
        };
    }
  };

  const config = getConfig();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }],
          top: insets.top + 10,
          backgroundColor: config.backgroundColor,
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialIcons 
            name={config.icon} 
            size={22} 
            color={config.iconColor} 
          />
        </View>
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
    flex: 1,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
});