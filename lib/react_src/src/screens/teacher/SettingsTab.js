import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, ScrollView
} from "react-native";
import { changePassword } from "../../utils/api";

export default function SettingsTab({ cookie, onLogout }) {
  const [newPass, setNewPass] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChangePass = async () => {
    if (newPass.length < 4) { Alert.alert("خطا", "رمز عبور باید حداقل ۴ کاراکتر باشد"); return; }
    setSaving(true);
    try {
      const { data } = await changePassword(newPass, cookie);
      if (data.ok) { Alert.alert("✅", "رمز عبور تغییر یافت"); setNewPass(""); }
      else Alert.alert("خطا", data.error || "خطا");
    } catch { Alert.alert("خطا", "خطا در اتصال"); }
    finally { setSaving(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔐 تغییر رمز عبور</Text>
        <TextInput
          style={styles.input}
          placeholder="رمز عبور جدید"
          placeholderTextColor="#aaa"
          secureTextEntry
          value={newPass}
          onChangeText={setNewPass}
          textAlign="right"
        />
        <TouchableOpacity style={styles.btn} onPress={handleChangePass} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>ذخیره رمز جدید</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>ℹ️ درباره برنامه</Text>
        <Text style={styles.infoText}>پنل آموزشی جامع</Text>
        <Text style={styles.infoText}>طراح: نادر اکشیک</Text>
        <Text style={styles.infoText}>نسخه اندروید ۱.۰</Text>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
        <Text style={styles.logoutText}>🚪 خروج از حساب</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  card: {
    backgroundColor: "#fff", borderRadius: 14,
    padding: 16, marginBottom: 14, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: "bold", color: "#667eea", marginBottom: 12, textAlign: "right" },
  input: {
    borderWidth: 1.5, borderColor: "#ddd", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
    color: "#333", marginBottom: 12, backgroundColor: "#fafafa",
  },
  btn: {
    backgroundColor: "#667eea", borderRadius: 10,
    padding: 14, alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  infoText: { fontSize: 13, color: "#666", textAlign: "right", marginBottom: 4 },
  logoutBtn: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1.5,
    borderColor: "#ef4444", padding: 16, alignItems: "center",
  },
  logoutText: { color: "#ef4444", fontWeight: "bold", fontSize: 15 },
});
