import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { updateDeviceWifi, getDeviceWifi } from "../../services/deviceService";

export default function WifiSettingsScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const poultryId =
    route.params?.poultryId ??
    route.params?.poulaillerId ??
    route.params?.id ??
    null;

  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentSsid, setCurrentSsid] = useState(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!poultryId) {
      setFetching(false);
      return;
    }
    (async () => {
      try {
        const res = await getDeviceWifi(poultryId);
        if (res?.success) setCurrentSsid(res.data?.ssid ?? null);
      } catch (e) {
        console.warn("[WifiSettings] getDeviceWifi:", e.message);
      } finally {
        setFetching(false);
      }
    })();
  }, [poultryId]);

  const handleSave = async () => {
    if (!poultryId) {
      Alert.alert("Erreur", "ID du poulailler manquant");
      return;
    }
    if (!ssid.trim()) {
      Alert.alert("Erreur", "Le nom du réseau WiFi est requis");
      return;
    }

    Alert.alert(
      "Changer le WiFi",
      `L'ESP32 va redémarrer et se connecter à "${ssid.trim()}". Continuer ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          onPress: async () => {
            setLoading(true);
            try {
              await updateDeviceWifi(poultryId, {
                ssid: ssid.trim(),
                password,
              });
              setCurrentSsid(ssid.trim());
              setSsid("");
              setPassword("");
              Alert.alert(
                "Succès",
                "Commande envoyée. L'ESP32 va redémarrer avec le nouveau WiFi.",
              );
            } catch (e) {
              Alert.alert("Erreur", e?.message ?? "Erreur inconnue");
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  if (!poultryId) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>ID du poulailler manquant.</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: Platform.OS === "ios" ? insets.top : 0 },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Paramètres WiFi</Text>
          <Text style={styles.headerSub}>Configuration réseau ESP32</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Réseau actuel */}
        <View style={styles.currentBox}>
          <View style={styles.currentLeft}>
            <MaterialIcons name="wifi" size={20} color="#22C55E" />
            <Text style={styles.currentLabel}>Réseau actuel</Text>
          </View>
          {fetching ? (
            <ActivityIndicator size="small" color="#22C55E" />
          ) : (
            <Text style={styles.currentValue} numberOfLines={1}>
              {currentSsid ?? "Non configuré"}
            </Text>
          )}
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle-outline"
            size={16}
            color="#3B82F6"
          />
          <Text style={styles.infoText}>
            La commande est envoyée via MQTT. L'ESP32 sauvegarde le nouveau WiFi
            en mémoire interne et redémarre automatiquement.
          </Text>
        </View>

        {/* Formulaire */}
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Nouveau réseau</Text>

          <Text style={styles.label}>Nom du réseau (SSID)</Text>
          <TextInput
            placeholder="Ex : MonWifi_2.4G"
            placeholderTextColor="#94A3B8"
            value={ssid}
            onChangeText={setSsid}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          <Text style={styles.label}>Mot de passe</Text>
          <View style={styles.passwordRow}>
            <TextInput
              placeholder="Mot de passe WiFi"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              style={styles.eyeBtn}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#94A3B8"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.warnBox}>
            <Ionicons name="warning-outline" size={15} color="#D97706" />
            <Text style={styles.warnText}>
              L'ESP32 redémarre après l'envoi. Si les informations sont
              incorrectes, il utilisera le WiFi par défaut embarqué dans le
              firmware.
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleSave}
            disabled={loading}
            style={[styles.button, loading && styles.buttonDisabled]}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="wifi" size={18} color="#fff" />
                <Text style={styles.buttonText}>Appliquer</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center", marginHorizontal: 12 },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#1E293B" },
  headerSub: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  content: { padding: 20, gap: 16 },
  currentBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  currentLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  currentLabel: { fontSize: 13, color: "#64748B", fontWeight: "500" },
  currentValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    maxWidth: 180,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  infoText: { flex: 1, fontSize: 12, color: "#1E40AF", lineHeight: 18 },
  form: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 13,
    fontSize: 15,
    color: "#0F172A",
    backgroundColor: "#FAFAFA",
    marginBottom: 4,
  },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyeBtn: {
    width: 44,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  warnBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  warnText: { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 18 },
  button: {
    backgroundColor: "#22C55E",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: { color: "#EF4444", fontSize: 14, textAlign: "center" },
});
