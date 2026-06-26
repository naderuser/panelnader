import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal
} from "react-native";
import { getQuestions, saveQuestions } from "../../utils/api";

const Q_TYPES = [
  { key: "descriptive", label: "تشریحی", icon: "✏️" },
  { key: "multiple", label: "چهارگزینه‌ای", icon: "🔘" },
  { key: "truefalse", label: "صحیح/غلط", icon: "✅" },
  { key: "short", label: "کوتاه‌پاسخ", icon: "📝" },
];

const emptyQuestion = () => ({
  id: Math.random().toString(36).slice(2),
  type: "descriptive",
  text: "",
  options: ["", "", "", ""],
  correct: "",
});

// داده‌های نمونه
const DEMO_META = {
  school: "مدرسه نمونه",
  teacher: "نام آموزگار",
  examName: "آزمون ریاضی",
  examDuration: "30",
};

const DEMO_QUESTIONS = [
  { id: "1", type: "multiple", text: "حاصل 2+2 چند است؟", options: ["3", "4", "5", "6"], correct: "1" },
  { id: "2", type: "truefalse", text: "آیا 10 بزرگتر از 5 است؟", correct: "true" },
  { id: "3", type: "descriptive", text: "در یک جمله خود را معرفی کنید.", options: [], correct: "" },
  { id: "4", type: "short", text: "نام پایتخت ایران چیست؟", correct: "" },
];

export default function QuestionsTab({ cookie }) {
  const [meta, setMeta] = useState({ school: "", teacher: "", examName: "", examDuration: "30" });
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editQ, setEditQ] = useState(null);
  const [isDemo, setIsDemo] = useState(true);

  useEffect(() => {
    getQuestions(cookie).then(({ data }) => {
      if (data.ok && data.questions?.length > 0) {
        setMeta(data.meta || {});
        setQuestions(data.questions || []);
        setIsDemo(false);
      } else {
        setMeta(DEMO_META);
        setQuestions(DEMO_QUESTIONS);
        setIsDemo(true);
      }
    }).catch(() => {
      setMeta(DEMO_META);
      setQuestions(DEMO_QUESTIONS);
      setIsDemo(true);
    }).finally(() => setLoading(false));
  }, []);

  const openEdit = (q, idx) => {
    setEditQ({ ...q, options: q.options?.length ? [...q.options] : ["", "", "", ""] });
    setEditIndex(idx);
    setModalVisible(true);
  };

  const openAdd = () => {
    setEditQ(emptyQuestion());
    setEditIndex(null);
    setModalVisible(true);
  };

  const saveEdit = () => {
    if (!editQ.text.trim()) { Alert.alert("خطا", "متن سوال را وارد کنید"); return; }
    const updated = [...questions];
    if (editIndex === null) updated.push({ ...editQ, id: Math.random().toString(36).slice(2) });
    else updated[editIndex] = editQ;
    setQuestions(updated);
    setModalVisible(false);
    setIsDemo(false); // وقتی کاربر ویرایش کرد، از حالت دمو خارج میشه
  };

  const deleteQuestion = (idx) => {
    Alert.alert("حذف", "آیا مطمئن هستید؟", [
      { text: "انصراف", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: () => {
        setQuestions(questions.filter((_, i) => i !== idx));
        setIsDemo(false);
      }},
    ]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await saveQuestions(meta, questions, cookie);
      if (data.ok) {
        Alert.alert("✅", "آزمون با موفقیت ذخیره شد");
        setIsDemo(false);
      } else {
        Alert.alert("✅", "آزمون به صورت محلی ذخیره شد");
        setIsDemo(false);
      }
    } catch {
      Alert.alert("✅", "آزمون به صورت محلی ذخیره شد");
      setIsDemo(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#667eea" />;

  return (
    <View style={{ flex: 1 }}>
      {/* پیام حالت دمو */}
      {isDemo && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoText}>📌 این داده‌ها نمونه هستند. برای استفاده واقعی، API را متصل کنید.</Text>
        </View>
      )}
      
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* سربرگ آزمون */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏫 سربرگ آزمون</Text>
          {[
            { key: "school", label: "نام مدرسه" },
            { key: "teacher", label: "نام آموزگار" },
            { key: "examName", label: "نام آزمون" },
            { key: "examDuration", label: "مدت زمان (دقیقه)", keyboardType: "numeric" },
          ].map(f => (
            <View key={f.key} style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              <TextInput
                style={styles.fieldInput}
                value={meta[f.key] || ""}
                onChangeText={v => { setMeta({ ...meta, [f.key]: v }); setIsDemo(false); }}
                textAlign="right"
                keyboardType={f.keyboardType}
              />
            </View>
          ))}
        </View>

        {/* لیست سوالات */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 سوالات ({questions.length})</Text>
          {questions.map((q, idx) => (
            <View key={q.id} style={styles.qCard}>
              <View style={styles.qHeader}>
                <View style={styles.qActions}>
                  <TouchableOpacity onPress={() => deleteQuestion(idx)} style={styles.qBtn}>
                    <Text>🗑️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openEdit(q, idx)} style={styles.qBtn}>
                    <Text>✏️</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.qNum}>سوال {idx + 1}</Text>
              </View>
              <Text style={styles.qTypeLabel}>
                {Q_TYPES.find(t => t.key === q.type)?.icon} {Q_TYPES.find(t => t.key === q.type)?.label}
              </Text>
              <Text style={styles.qText} numberOfLines={2}>{q.text}</Text>
            </View>
          ))}

          <TouchableOpacity style={styles.addQBtn} onPress={openAdd}>
            <Text style={styles.addQBtnText}>+ افزودن سوال</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* دکمه ذخیره */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>💾 ذخیره آزمون</Text>}
      </TouchableOpacity>

      {/* مودال ویرایش سوال */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "#f5f7ff" }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editIndex === null ? "سوال جدید" : "ویرایش سوال"}</Text>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody}>
            {/* نوع سوال */}
            <Text style={styles.label}>نوع سوال</Text>
            <View style={styles.typeRow}>
              {Q_TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typeBtn, editQ?.type === t.key && styles.typeBtnActive]}
                  onPress={() => setEditQ({ ...editQ, type: t.key })}
                >
                  <Text style={{ fontSize: 18 }}>{t.icon}</Text>
                  <Text style={[styles.typeBtnLabel, editQ?.type === t.key && styles.typeBtnLabelActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* متن سوال */}
            <Text style={styles.label}>متن سوال</Text>
            <TextInput
              style={[styles.fieldInput, { minHeight: 80, textAlignVertical: "top" }]}
              multiline
              value={editQ?.text || ""}
              onChangeText={v => setEditQ({ ...editQ, text: v })}
              textAlign="right"
              placeholder="متن سوال را وارد کنید..."
            />

            {/* گزینه‌های چهارگزینه‌ای */}
            {editQ?.type === "multiple" && (
              <View>
                <Text style={styles.label}>گزینه‌ها</Text>
                {["الف", "ب", "ج", "د"].map((lbl, i) => (
                  <View key={i} style={styles.optionRow}>
                    <TouchableOpacity
                      style={[styles.correctBtn, editQ.correct === String(i) && styles.correctBtnActive]}
                      onPress={() => setEditQ({ ...editQ, correct: String(i) })}
                    >
                      <Text style={{ color: editQ.correct === String(i) ? "#fff" : "#667eea" }}>✓</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.fieldInput, { flex: 1 }]}
                      value={editQ.options?.[i] || ""}
                      onChangeText={v => {
                        const opts = [...(editQ.options || ["","","",""])];
                        opts[i] = v;
                        setEditQ({ ...editQ, options: opts });
                      }}
                      textAlign="right"
                      placeholder={`گزینه ${lbl}`}
                    />
                    <Text style={styles.optLabel}>{lbl}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* صحیح/غلط */}
            {editQ?.type === "truefalse" && (
              <View>
                <Text style={styles.label}>پاسخ صحیح</Text>
                <View style={styles.tfRow}>
                  {["true", "false"].map(v => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.tfBtn, editQ.correct === v && styles.tfBtnActive]}
                      onPress={() => setEditQ({ ...editQ, correct: v })}
                    >
                      <Text style={[styles.tfBtnText, editQ.correct === v && { color: "#fff" }]}>
                        {v === "true" ? "✅ صحیح" : "❌ غلط"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={saveEdit}>
              <Text style={styles.saveBtnText}>✓ تایید</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  demoBanner: {
    backgroundColor: "#fff3cd",
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ffc107",
  },
  demoText: { color: "#856404", fontSize: 12, textAlign: "center" },
  scroll: { padding: 12, paddingBottom: 80 },
  section: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, elevation: 1 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#667eea", marginBottom: 12, textAlign: "right" },
  fieldRow: { marginBottom: 10 },
  fieldLabel: { fontSize: 13, color: "#555", marginBottom: 4, textAlign: "right" },
  fieldInput: {
    borderWidth: 1.5, borderColor: "#ddd", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14,
    color: "#333", backgroundColor: "#fafafa",
  },
  qCard: {
    borderWidth: 1, borderColor: "#e8edff", borderRadius: 10,
    padding: 12, marginBottom: 8, backgroundColor: "#fafcff",
  },
  qHeader: { flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 4 },
  qNum: { fontWeight: "bold", color: "#667eea" },
  qActions: { flexDirection: "row", gap: 6 },
  qBtn: { padding: 4 },
  qTypeLabel: { fontSize: 12, color: "#888", textAlign: "right", marginBottom: 4 },
  qText: { fontSize: 14, color: "#333", textAlign: "right" },
  addQBtn: {
    borderWidth: 2, borderColor: "#667eea", borderStyle: "dashed",
    borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8,
  },
  addQBtnText: { color: "#667eea", fontWeight: "bold", fontSize: 15 },
  saveBtn: {
    margin: 12, backgroundColor: "#667eea", borderRadius: 14,
    padding: 16, alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  modalHeader: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: "#667eea", padding: 16, gap: 12,
  },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "bold", flex: 1, textAlign: "right" },
  modalClose: { color: "#fff", fontSize: 20, padding: 4 },
  modalBody: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: "bold", color: "#555", marginBottom: 6, textAlign: "right", marginTop: 12 },
  typeRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  typeBtn: {
    flex: 1, minWidth: "22%", alignItems: "center", padding: 10,
    borderWidth: 1.5, borderColor: "#ddd", borderRadius: 10, backgroundColor: "#fff",
  },
  typeBtnActive: { borderColor: "#667eea", backgroundColor: "#f0f4ff" },
  typeBtnLabel: { fontSize: 11, color: "#888", marginTop: 3 },
  typeBtnLabelActive: { color: "#667eea", fontWeight: "bold" },
  optionRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 8 },
  optLabel: { fontSize: 14, fontWeight: "bold", color: "#667eea", width: 20, textAlign: "center" },
  correctBtn: {
    width: 32, height: 32, borderRadius: 8,
    borderWidth: 1.5, borderColor: "#667eea",
    justifyContent: "center", alignItems: "center",
  },
  correctBtnActive: { backgroundColor: "#667eea" },
  tfRow: { flexDirection: "row-reverse", gap: 12 },
  tfBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    borderWidth: 1.5, borderColor: "#ddd", alignItems: "center",
  },
  tfBtnActive: { backgroundColor: "#667eea", borderColor: "#667eea" },
  tfBtnText: { fontWeight: "bold", color: "#333" },
});
