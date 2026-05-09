// screens/ai/AIChatScreen.js
// ============================================================
// Chat Vétérinaire IA — Smart Poultry
// Connecté à POST /api/ai/chat (Gemma 3 via Cloudflare)
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";

import { useAIAnalysis } from "../../hooks/useAIAnalysis";

const { width } = Dimensions.get("window");

// ── Chips de questions rapides ───────────────────────────────────────────────
const QUICK_CHIPS = [
  {
    label: "État général",
    question: "Quel est l'état de santé général de mes volailles ?",
  },
  {
    label: "Alertes",
    question: "Y a-t-il des alertes ou dangers à surveiller ?",
  },
  {
    label: "Conseils",
    question: "Quels sont tes conseils prioritaires pour ce poulailler ?",
  },
  {
    label: "Température",
    question: "Comment est la température dans le poulailler ?",
  },
  {
    label: "Alimentation",
    question: "Y a-t-il des recommandations sur l'alimentation et l'eau ?",
  },
];

// ── Formatteur heure ─────────────────────────────────────────────────────────
function nowTime() {
  return new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Composant : point de présence animé ─────────────────────────────────────
function StatusDot() {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  return <Animated.View style={[styles.statusDot, { opacity: pulse }]} />;
}

// ── Composant : indicateur "en train d'écrire…" ──────────────────────────────
function TypingIndicator() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, []);

  return (
    <View style={styles.typingContainer}>
      <View style={styles.typingAvatar}>
        <Text style={styles.typingAvatarText}>🤖</Text>
      </View>
      <View style={styles.typingBubble}>
        <View style={styles.typingDots}>
          {dots.map((dot, i) => (
            <Animated.View
              key={i}
              style={[styles.typingDot, { opacity: dot }]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Composant : bulle de message ─────────────────────────────────────────────
function MessageBubble({ message }) {
  const isUser = message.type === "user";
  const isWelcome = message.type === "welcome";

  if (isWelcome) {
    return (
      <LinearGradient
        colors={["#22C55E", "#16A34A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.welcomeCard}
      >
        <View style={styles.welcomeCircle} />
        <Text style={styles.welcomeTitle}>{message.title}</Text>
        <Text style={styles.welcomeText}>{message.text}</Text>
        <View style={styles.welcomeContext}>
          <Text style={styles.welcomeContextText}>🏠 {message.context}</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.messageRow, isUser ? styles.rowUser : styles.rowAi]}>
      <View
        style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}
      >
        <Text
          style={[styles.bubbleText, isUser ? styles.textUser : styles.textAi]}
        >
          {message.text}
        </Text>
        <View style={[styles.meta, isUser ? styles.metaUser : styles.metaAi]}>
          {message.meta && (
            <View style={styles.sourceTag}>
              <Text style={styles.sourceTagText}>⏱ {message.meta}</Text>
            </View>
          )}
          <Text
            style={[styles.timeText, isUser ? styles.timeUser : styles.timeAi]}
          >
            {message.time}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Écran principal ───────────────────────────────────────────────────────────
export default function AIChatScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const {
    poultryId,
    poultryName,
    context: initialContext,
  } = route?.params || {};

  const { askVet, chatLoading, latestResult } = useAIAnalysis(poultryId);
  const context = latestResult || initialContext;

  const contextLabel = context
    ? `${poultryName || "Poulailler"} | Score santé: ${context.healthScore}/100`
    : `${poultryName || "Poulailler"} | Aucune analyse récente`;

  const [messages, setMessages] = useState([
    {
      id: "welcome",
      type: "welcome",
      title: "🤖 Dr. Gemma — Assistant Vétérinaire",
      text: "Spécialisé en élevage de volailles. Posez-moi vos questions sur la santé, l'alimentation ou les conditions de vos poulaillers.",
      context: contextLabel,
    },
  ]);

  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  // Scroll automatique à chaque nouveau message
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  // ── Envoi d'un message ────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text) => {
      const question = (text || input).trim();
      if (!question || chatLoading) return;

      setInput("");

      const userMsg = {
        id: `user-${Date.now()}`,
        type: "user",
        text: question,
        time: nowTime(),
      };

      setMessages((prev) => [...prev, userMsg]);

      try {
        const t0 = Date.now();
        const { answer } = await askVet(question);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        const aiMsg = {
          id: `ai-${Date.now()}`,
          type: "ai",
          text: answer,
          meta: `Gemma 3 • ${elapsed}s`,
          time: nowTime(),
        };

        setMessages((prev) => [...prev, aiMsg]);
      } catch (err) {
        const errMsg = {
          id: `err-${Date.now()}`,
          type: "ai",
          text: `Désolé, une erreur est survenue : ${err.message}. Réessayez dans quelques instants.`,
          time: nowTime(),
        };
        setMessages((prev) => [...prev, errMsg]);
      }
    },
    [input, chatLoading, askVet],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>

        <View style={styles.aiAvatar}>
          <Text style={styles.aiAvatarText}>🤖</Text>
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>Dr. Gemma</Text>
          <View style={styles.headerStatus}>
            <StatusDot />
            <Text style={styles.headerStatusText}>Assistant IA actif</Text>
          </View>
        </View>

        {/* Indicateur chargement en haut à droite */}
        {chatLoading && <ActivityIndicator size="small" color="#22C55E" />}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* ── Messages ── */}
        <ScrollView
          ref={scrollRef}
          style={styles.chatContainer}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {chatLoading && <TypingIndicator />}
        </ScrollView>

        {/* ── Chips rapides ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsContent}
        >
          {QUICK_CHIPS.map((chip) => (
            <TouchableOpacity
              key={chip.label}
              style={styles.chip}
              onPress={() => sendMessage(chip.question)}
              activeOpacity={0.7}
              disabled={chatLoading}
            >
              <Text style={styles.chipLabel}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Barre de saisie ── */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.inputField}
            value={input}
            onChangeText={setInput}
            placeholder="Posez votre question..."
            placeholderTextColor="#94A3B8"
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage()}
            editable={!chatLoading}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() || chatLoading) && styles.sendBtnDisabled,
            ]}
            onPress={() => sendMessage()}
            activeOpacity={0.8}
            disabled={!input.trim() || chatLoading}
          >
            <MaterialIcons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAF9" },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnText: { fontSize: 18, color: "#1E293B" },
  aiAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  aiAvatarText: { fontSize: 20 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 15, fontWeight: "800", color: "#1E293B" },
  headerStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
  },
  headerStatusText: { fontSize: 12, color: "#22C55E", fontWeight: "600" },

  // Messages
  chatContainer: { flex: 1 },
  chatContent: { padding: 20, paddingBottom: 12 },

  // Welcome card
  welcomeCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    overflow: "hidden",
    position: "relative",
  },
  welcomeCircle: {
    position: "absolute",
    top: -20,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  welcomeTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 13,
    lineHeight: 20,
    color: "rgba(255,255,255,0.95)",
  },
  welcomeContext: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
  },
  welcomeContextText: { fontSize: 12, color: "rgba(255,255,255,0.9)" },

  // Bulles
  messageRow: { marginBottom: 16, flexDirection: "row" },
  rowUser: { justifyContent: "flex-end" },
  rowAi: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "80%",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  bubbleUser: {
    backgroundColor: "#22C55E",
    borderBottomRightRadius: 4,
    marginLeft: 40,
  },
  bubbleAi: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    marginRight: 40,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  bubbleText: { fontSize: 14, lineHeight: 22 },
  textUser: { color: "#fff" },
  textAi: { color: "#1E293B" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  metaUser: { justifyContent: "flex-end" },
  metaAi: { justifyContent: "flex-start" },
  sourceTag: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
  },
  sourceTagText: { fontSize: 10, fontWeight: "600", color: "#64748B" },
  timeText: { fontSize: 11 },
  timeUser: { color: "rgba(255,255,255,0.7)" },
  timeAi: { color: "#94A3B8" },

  // Typing
  typingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  typingAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  typingAvatarText: { fontSize: 14 },
  typingBubble: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: "#fff",
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  typingDots: { flexDirection: "row", gap: 4 },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#CBD5E1",
  },

  // Chips
  chipsScroll: { maxHeight: 50 },
  chipsContent: { paddingHorizontal: 20, gap: 8, paddingBottom: 10 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
  },
  chipLabel: { fontSize: 13, fontWeight: "600", color: "#166534" },

  // Input
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: Platform.OS === "ios" ? 28 : 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  inputField: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    paddingHorizontal: 18,
    fontSize: 15,
    color: "#1E293B",
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: "#CBD5E1" },
});
