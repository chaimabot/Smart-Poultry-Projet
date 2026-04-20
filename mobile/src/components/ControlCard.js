import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const ControlCard = ({
  title,
  icon,
  iconColor,
  isAuto,
  status,
  onToggleAuto,
  onToggleStatus,
  description,
}) => {
  return (
    <View style={styles.card}>
      {/* En-tête */}
      <View style={[styles.row, { marginBottom: isAuto ? 0 : 14 }]}>
        <View style={[styles.iconBox, { backgroundColor: `${iconColor}18` }]}>
          <MaterialCommunityIcons name={icon} size={22} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>
            {isAuto
              ? `Auto — ${description}`
              : `Manuel — ${status ? "● En marche" : "○ Arrêté"}`}
          </Text>
        </View>
        <TouchableOpacity onPress={onToggleAuto}>
          <Segment options={["AUTO", "MANU"]} selected={isAuto ? 0 : 1} />
        </TouchableOpacity>
      </View>

      {/* Boutons de contrôle manuel */}
      {!isAuto && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {/* Bouton Allumer */}
          <TouchableOpacity
            onPress={() => onToggleStatus("on")}
            disabled={status}
            style={[
              styles.button,
              {
                backgroundColor: status ? `${iconColor}18` : iconColor,
                borderColor: `${iconColor}40`,
                opacity: !status ? 1 : 0.5,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="play"
              size={16}
              color={status ? iconColor : "#fff"}
            />
            <Text
              style={[
                styles.buttonText,
                { color: status ? iconColor : "#fff" },
              ]}
            >
              Allumer
            </Text>
          </TouchableOpacity>

          {/* Bouton Éteindre */}
          <TouchableOpacity
            onPress={() => onToggleStatus("off")}
            disabled={!status}
            style={[
              styles.button,
              {
                backgroundColor: status ? "#FEF2F2" : "#F8FAFC",
                borderColor: status ? "#EF444440" : "#F1F5F9",
                opacity: status ? 1 : 0.5,
              },
            ]}
          >
            <MaterialCommunityIcons name="stop" size={16} color="#EF4444" />
            <Text style={[styles.buttonText, { color: "#EF4444" }]}>
              Éteindre
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

function Segment({ options, selected }) {
  return (
    <View style={styles.segment}>
      {options.map((opt, i) => (
        <View
          key={i}
          style={[
            styles.segmentItem,
            { backgroundColor: selected === i ? "#0EA5E9" : "transparent" },
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              { color: selected === i ? "#fff" : "#94A3B8" },
            ]}
          >
            {opt}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 999,
    padding: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  sub: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
    marginTop: 2,
  },
  button: {
    flex: 1,
    padding: 11,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  segment: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  segmentItem: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  segmentText: {
    fontSize: 10,
    fontWeight: "700",
  },
});

export default ControlCard;
