import React, { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, KeyboardAvoidingView, Platform
} from "react-native";
import { aiChat } from "../../utils/api";

const QUICK_ACTIONS = [
  { label: "ساخت سوال تستی", prompt: "یک سوال تستی چهارگزینه‌ای برای پایه چهارم ابتدایی درس علوم بساز" },
  { label: "برنامه درسی", prompt: "یک برنامه درسی هفتگی برای کلاس پنجم ابتدایی بساز" },
  { label: "بازخورد دانش‌آموز", prompt: "متن بازخورد مثبت و انگیزشی برای دانش‌آموزی که پیشرفت کرده بنویس" },
  { label: "سوال تشریحی", prompt: "سه سوال تشریحی برای آزمون ریاضی پایه ششم بساز" },
];

export default function AiChatTab({ cookie }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  const send = async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg) return;
    setInput("");

    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const { data } = await aiChat(
        [
          { role: "system", content: "تو یک دستیار هوشمند برای معلمان ایرانی هستی. به زبان فارسی پاسخ بده." },
          ...newMessages.slice(-10),
        ],
        cookie
      );
      if (data.ok) {
        setMessages([...newMessages, { role: "assistant", content: data.content }]);
      } else {
        setMessages([...newMessages, { role: "assistant", content: "❌ خطا: " + (data.error || "خطای ناشناخته") }]);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "❌ خطا در اتصال" }]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const renderMsg = ({ item }) => (
    <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}>
      <Text style={[styles.bubbleText, item.role === "user" ? styles.userText : styles.aiText]}>
        {item.content}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* دکمه‌های سریع */}
      {messages.length === 0 && (
        <View style={styles.quickWrap}>
          <Text style={styles.quickTitle}>💡 سوالات سریع</Text>
          <View style={styles.quickGrid}>
            {QUICK_ACTIONS.map((a, i) => (
              <TouchableOpacity key={i} style={styles.quickBtn} onPress={() => send(a.prompt)}>
                <Text style={styles.quickBtnText}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderMsg}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={null}
      />

      {loading && (
        <View style={styles.typing}>
          <ActivityIndicator size="small" color="#667eea" />
          <Text style={styles.typingText}>در حال تایپ...</Text>
        </View>
      )}

      {/* ورودی */}
      <View style={styles.inputRow}>
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
          onPress={() => send()}
          disabled={!input.trim() || loading}
        >
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="پیام خود را بنویسید..."
          placeholderTextColor="#bbb"
          multiline
          textAlign="right"
          onSubmitEditing={() => send()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  quickWrap: { padding: 16 },
  quickTitle: { fontSize: 14, fontWeight: "bold", color: "#667eea", marginBottom: 10, textAlign: "right" },
  quickGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  quickBtn: {
    backgroundColor: "#f0f4ff", borderRadius: 20, borderWidth: 1,
    borderColor: "#c7d2fe", paddingHorizontal: 14, paddingVertical: 8,
  },
  quickBtnText: { color: "#667eea", fontSize: 13 },
  list: { padding: 12, flexGrow: 1 },
  bubble: { maxWidth: "82%", marginBottom: 10, borderRadius: 16, padding: 12 },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#667eea", borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: "flex-start", backgroundColor: "#fff", borderBottomLeftRadius: 4, elevation: 1 },
  bubbleText: { fontSize: 14, lineHeight: 22 },
  userText: { color: "#fff", textAlign: "right" },
  aiText: { color: "#333", textAlign: "right" },
  typing: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 10 },
  typingText: { color: "#888", fontSize: 13 },
  inputRow: {
    flexDirection: "row-reverse", padding: 10, gap: 8,
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eee",
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    borderWidth: 1.5, borderColor: "#ddd", borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: "#333", backgroundColor: "#fafafa",
  },
  sendBtn: {
    width: 44, height: 44, backgroundColor: "#667eea",
    borderRadius: 22, justifyContent: "center", alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: "#fff", fontSize: 18 },
});
