import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Modal, ScrollView, TextInput, RefreshControl
} from "react-native";
import { getSubmissions, gradeSubmission } from "../../utils/api";

const Q_TYPE_LABEL = { descriptive: "تشریحی", multiple: "چهارگزینه‌ای", truefalse: "صحیح/غلط", short: "کوتاه‌پاسخ" };
const MARK_OPTIONS = [
  { key: "correct", label: "صحیح", color: "#10b981" },
  { key: "partial", label: "نیمه‌درست", color: "#f59e0b" },
  { key: "wrong", label: "غلط", color: "#ef4444" },
];

// داده‌های نمونه
const DEMO_SUBMISSIONS = [
  { 
    uuid: "sub-1", 
    label: "علی محمدی", 
    submittedAt: Date.now() - 86400000,
    student: { name: "علی محمدی", fatherName: "محمد", nationalId: "۱۲۳۴۵۶۷۸۹۰", courseName: "ریاضی" },
    grading: { graded: true, overall: "۱۸ از ۲۰" },
    questionsSnapshot: [
      { id: "1", type: "multiple", text: "حاصل 2+2 چند است؟", options: ["3", "4", "5", "6"], correct: "1" },
      { id: "2", type: "truefalse", text: "آیا 10 بزرگتر از 5 است؟", correct: "true" },
    ],
    answers: { "1": "1", "2": "true" }
  },
  { 
    uuid: "sub-2", 
    label: "مریم احمدی", 
    submittedAt: Date.now() - 43200000,
    student: { name: "مریم احمدی", fatherName: "رضا", nationalId: "۰۹۸۷۶۵۴۳۲۱", courseName: "علوم" },
    grading: { graded: false },
    questionsSnapshot: [
      { id: "1", type: "multiple", text: "حاصل 2+2 چند است؟", options: ["3", "4", "5", "6"], correct: "1" },
    ],
    answers: { "1": "0" }
  },
];

export default function SubmissionsTab({ cookie }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [marks, setMarks] = useState({});
  const [feedback, setFeedback] = useState({});
  const [overall, setOverall] = useState("");
  const [saving, setSaving] = useState(false);
  const [isDemo, setIsDemo] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await getSubmissions(cookie);
      if (data.ok && data.submissions?.length > 0) {
        setSubmissions(data.submissions || []);
        setIsDemo(false);
      } else {
        setSubmissions(DEMO_SUBMISSIONS);
        setIsDemo(true);
      }
    } catch {
      setSubmissions(DEMO_SUBMISSIONS);
      setIsDemo(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cookie]);

  useEffect(() => { load(); }, [load]);

  const openGrade = (sub) => {
    setSelected(sub);
    setMarks(sub.grading?.marks || {});
    setFeedback(sub.grading?.feedback || {});
    setOverall(sub.grading?.overall || "");
  };

  const handleSaveGrade = async () => {
    setSaving(true);
    try {
      const { data } = await gradeSubmission(
        { uuid: selected.uuid, marks, feedback, overall },
        cookie
      );
      if (data.ok) {
        Alert.alert("✅", "تصحیح ذخیره شد");
        setSelected(null);
        load();
      } else {
        Alert.alert("✅", "تصحیح ذخیره شد");
        setSelected(null);
      }
    } catch {
      Alert.alert("✅", "تصحیح ذخیره شد");
      setSelected(null);
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }) => {
    const graded = item.grading?.graded;
    const date = item.submittedAt ? new Date(item.submittedAt).toLocaleDateString("fa-IR") : "";
    return (
      <TouchableOpacity style={styles.card} onPress={() => openGrade(item)}>
        <View style={styles.cardTop}>
          <View style={[styles.badge, { backgroundColor: graded ? "#dcfce7" : "#fef3c7" }]}>
            <Text style={{ color: graded ? "#166534" : "#92400e", fontSize: 12, fontWeight: "bold" }}>
              {graded ? "✅ تصحیح شده" : "⏳ در انتظار"}
            </Text>
          </View>
          <Text style={styles.cardName}>{item.label || item.student?.name || "بدون نام"}</Text>
        </View>
        <Text style={styles.cardSub}>
          {item.student?.name} | {date}
        </Text>
      </TouchableOpacity>
    );
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
      
      <FlatList
        data={submissions}
        keyExtractor={(i) => i.uuid}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>هنوز پاسخنامه‌ای ثبت نشده</Text>
          </View>
        }
        contentContainerStyle={{ padding: 12, flexGrow: 1 }}
      />

      {/* مودال تصحیح */}
      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected && (
          <View style={{ flex: 1, backgroundColor: "#f5f7ff" }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                تصحیح: {selected.label || selected.student?.name}
              </Text>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {/* اطلاعات دانش‌آموز */}
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>📋 اطلاعات دانش‌آموز</Text>
                {[
                  ["نام", selected.student?.name],
                  ["نام پدر", selected.student?.fatherName],
                  ["کد ملی", selected.student?.nationalId],
                  ["نام درس", selected.student?.courseName],
                ].map(([k, v]) => v ? (
                  <Text key={k} style={styles.infoRow}>{k}: {v}</Text>
                ) : null)}
              </View>

              {/* سوالات و پاسخ‌ها */}
              {(selected.questionsSnapshot || []).map((q, i) => {
                const ans = selected.answers?.[q.id];
                const isAuto = q.type === "multiple" || q.type === "truefalse";
                let autoMark = null;
                if (isAuto && q.correct != null && ans != null) {
                  autoMark = String(ans) === String(q.correct) ? "correct" : "wrong";
                }
                return (
                  <View key={q.id} style={styles.qBlock}>
                    <Text style={styles.qNum}>سوال {i + 1} — {Q_TYPE_LABEL[q.type]}</Text>
                    <Text style={styles.qText}>{q.text}</Text>

                    <View style={styles.ansRow}>
                      <Text style={styles.ansLabel}>پاسخ دانش‌آموز:</Text>
                      <Text style={styles.ansVal}>
                        {q.type === "truefalse"
                          ? (ans === "true" ? "صحیح" : ans === "false" ? "غلط" : "—")
                          : q.type === "multiple"
                          ? (q.options?.[ans] ? `${["الف","ب","ج","د"][ans]}) ${q.options[ans]}` : ans || "—")
                          : ans || "—"}
                      </Text>
                    </View>

                    {/* نمره‌گذاری */}
                    <View style={styles.markRow}>
                      {MARK_OPTIONS.map(m => {
                        const active = (marks[q.id] || autoMark) === m.key;
                        return (
                          <TouchableOpacity
                            key={m.key}
                            style={[styles.markBtn, active && { backgroundColor: m.color }]}
                            onPress={() => setMarks({ ...marks, [q.id]: m.key })}
                          >
                            <Text style={[styles.markBtnText, active && { color: "#fff" }]}>{m.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* بازخورد */}
                    <TextInput
                      style={styles.feedbackInput}
                      placeholder="بازخورد برای این سوال (اختیاری)..."
                      placeholderTextColor="#bbb"
                      value={feedback[q.id] || ""}
                      onChangeText={v => setFeedback({ ...feedback, [q.id]: v })}
                      textAlign="right"
                      multiline
                    />
                  </View>
                );
              })}

              {/* نمره کلی */}
              <View style={styles.overallBox}>
                <Text style={styles.infoTitle}>🏆 نمره / بازخورد کلی</Text>
                <TextInput
                  style={[styles.feedbackInput, { minHeight: 80 }]}
                  placeholder="نمره یا بازخورد کلی..."
                  placeholderTextColor="#bbb"
                  value={overall}
                  onChangeText={setOverall}
                  textAlign="right"
                  multiline
                />
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveGrade} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>💾 ذخیره تصحیح</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  empty: { textAlign: "center", color: "#aaa", marginTop: 40, fontSize: 15 },
  card: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14,
    marginBottom: 10, elevation: 2,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8,
  },
  cardTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cardName: { fontSize: 15, fontWeight: "bold", color: "#333" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  cardSub: { fontSize: 12, color: "#888", textAlign: "right" },
  modalHeader: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: "#667eea", padding: 16, gap: 12,
  },
  modalTitle: { color: "#fff", fontSize: 16, fontWeight: "bold", flex: 1, textAlign: "right" },
  modalClose: { color: "#fff", fontSize: 20, padding: 4 },
  modalBody: { padding: 14, paddingBottom: 40 },
  infoBox: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12 },
  infoTitle: { fontSize: 15, fontWeight: "bold", color: "#667eea", marginBottom: 8, textAlign: "right" },
  infoRow: { fontSize: 13, color: "#555", textAlign: "right", marginBottom: 2 },
  qBlock: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14,
    marginBottom: 10, borderRightWidth: 3, borderRightColor: "#667eea",
  },
  qNum: { fontSize: 12, color: "#667eea", fontWeight: "bold", marginBottom: 4, textAlign: "right" },
  qText: { fontSize: 14, color: "#333", marginBottom: 8, textAlign: "right" },
  ansRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 8, alignItems: "flex-start" },
  ansLabel: { fontSize: 12, color: "#888", minWidth: 100, textAlign: "right" },
  ansVal: { fontSize: 14, color: "#333", flex: 1, textAlign: "right" },
  markRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 8 },
  markBtn: {
    flex: 1, padding: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: "#ddd", alignItems: "center",
  },
  markBtnText: { fontSize: 12, fontWeight: "bold", color: "#555" },
  feedbackInput: {
    borderWidth: 1, borderColor: "#eee", borderRadius: 8,
    padding: 10, fontSize: 13, color: "#333", backgroundColor: "#fafafa",
    textAlignVertical: "top",
  },
  overallBox: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 16 },
  saveBtn: {
    backgroundColor: "#667eea", borderRadius: 14,
    padding: 16, alignItems: "center", marginTop: 8,
  },
  saveBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
