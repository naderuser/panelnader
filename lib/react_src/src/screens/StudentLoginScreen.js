import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from "react-native";
import { getExam } from "../utils/api";

export default function StudentLoginScreen({ navigation }) {
  const [uuid, setUuid] = useState("");
  const [loading, setLoading] = useState(false);

  // استخراج UUID از لینک کامل یا UUID مستقیم
  const extractUuid = (input) => {
    const trimmed = input.trim();
    // اگر لینک کامل باشد مثل https://...workers.dev/s/UUID
    const match = trimmed.match(/\/s\/([^/?#]+)/);
    if (match) return decodeURIComponent(match[1]);
    return trimmed;
  };

  const handleEnter = async () => {
    const id = extractUuid(uuid);
    if (!id) { Alert.alert("خطا", "کد یا لینک آزمون را وارد کنید"); return; }
    setLoading(true);
    try {
      const { data } = await getExam(id);
      if (data.ok) {
        navigation.navigate("StudentExam", { uuid: id, examData: data });
      } else {
        Alert.alert("خطا", data.error || "لینک نامعتبر است");
      }
    } catch {
      Alert.alert("خطا", "خطا در اتصال به سرور");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.card}>
        <Text style={styles.icon}>📝</Text>
        <Text style={styles.title}>ورود دانش‌آموز</Text>
        <Text style={styles.subtitle}>کد یا لینک آزمون خود را وارد کنید</Text>

        <TextInput
          style={styles.input}
          placeholder="کد یا لینک آزمون"
          placeholderTextColor="#aaa"
          value={uuid}
          onChangeText={setUuid}
          onSubmitEditing={handleEnter}
          autoCapitalize="none"
          autoCorrect={false}
          textAlign="right"
        />

        <TouchableOpacity style={styles.btn} onPress={handleEnter} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>ورود به آزمون</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate("TeacherLogin")}>
          <Text style={styles.linkText}>معلم هستم ←</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: "#f0fff4",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  card: {
    width: "100%", maxWidth: 400, backgroundColor: "#fff",
    borderRadius: 20, padding: 32, alignItems: "center",
    shadowColor: "#10b981", shadowOpacity: 0.15, shadowRadius: 20, elevation: 8,
  },
  icon: { fontSize: 56, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "bold", color: "#10b981", marginBottom: 4 },
  subtitle: { fontSize: 13, color: "#888", marginBottom: 28, textAlign: "center" },
  input: {
    width: "100%", height: 50, borderWidth: 1.5, borderColor: "#ddd",
    borderRadius: 12, paddingHorizontal: 16, fontSize: 14,
    color: "#333", backgroundColor: "#fafafa", marginBottom: 16,
  },
  btn: {
    width: "100%", height: 50, backgroundColor: "#10b981",
    borderRadius: 12, justifyContent: "center", alignItems: "center", marginBottom: 16,
  },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "bold" },
  linkBtn: { padding: 8 },
  linkText: { color: "#10b981", fontSize: 14 },
});
