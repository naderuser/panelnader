import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, SafeAreaView, Modal
} from "react-native";
import { submitExam } from "../utils/api";

export default function StudentExamScreen({ route, navigation }) {
  const { uuid, examData } = route.params;
  const { meta, questions, duration, submitted, result } = examData;

  const [step, setStep] = useState(submitted ? "result" : "info"); // info | exam | result
  const [studentInfo, setStudentInfo] = useState({
    name: "", fatherName: "", nationalId: "", courseName: "", examDate: ""
  });
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(duration || 1800);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef(null);

  // تایمر
  useEffect(() => {
    if (step !== "exam") return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          handleSubmit(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [step]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleSubmit = async (auto = false) => {
    if (!auto) {
      const unanswered = questions.filter(q => answers[q.id] == null).length;
      if (unanswered > 0) {
        Alert.alert(
          "سوالات بی‌پاسخ",
          `${unanswered} سوال پاسخ داده نشده. آیا مطمئنید؟`,
          [
            { text: "ادامه ویرایش", style: "cancel" },
            { text: "ثبت نهایی", onPress: () => doSubmit() }
          ]
        );
        return;
      }
    }
    doSubmit();
  };

  const doSubmit = async () => {
    clearInterval(timerRef.current);
    setSubmitting(true);
    try {
      const { data } = await submitExam(uuid, studentInfo, answers);
      if (data.ok) {
        setStep("result");
      } else {
        Alert.alert("خطا", data.error || "خطا در ثبت");
      }
    } catch {
      Alert.alert("خطا", "خطا در اتصال");
    } finally {
      setSubmitting(false);
    }
  };

  const startExam = () => {
    if (!studentInfo.name.trim()) { Alert.alert("خطا", "نام خود را وارد کنید"); return; }
    setStep("exam");
  };

  // --------- صفحه اطلاعات ---------
  if (step === "info") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📝 {meta?.examName || "آزمون"}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.infoScroll}>
          <View style={styles.metaCard}>
            {meta?.school && <Text style={styles.metaRow}>🏫 {meta.school}</Text>}
            {meta?.teacher && <Text style={styles.metaRow}>👩‍🏫 {meta.teacher}</Text>}
            {meta?.examDuration && <Text style={styles.metaRow}>⏱ مدت زمان: {meta.examDuration} دقیقه</Text>}
            <Text style={styles.metaRow}>📊 تعداد سوالات: {questions.length}</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>اطلاعات دانش‌آموز</Text>
            {[
              { key: "name", label: "نام و نام خانوادگی *" },
              { key: "fatherName", label: "نام پدر" },
              { key: "nationalId", label: "کد ملی", keyboardType: "numeric" },
              { key: "courseName", label: "نام درس" },
              { key: "examDate", label: "تاریخ آزمون" },
            ].map(f => (
              <View key={f.key} style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={studentInfo[f.key]}
                  onChangeText={v => setStudentInfo({ ...studentInfo, [f.key]: v })}
                  textAlign="right"
                  keyboardType={f.keyboardType}
                />
              </View>
            ))}

            <TouchableOpacity style={styles.startBtn} onPress={startExam}>
              <Text style={styles.startBtnText}>🚀 شروع آزمون</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --------- صفحه آزمون ---------
  if (step === "exam") {
    const timerColor = timeLeft < 300 ? "#ef4444" : timeLeft < 600 ? "#f59e0b" : "#10b981";
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.header, { justifyContent: "space-between" }]}>
          <View style={[styles.timer, { borderColor: timerColor }]}>
            <Text style={[styles.timerText, { color: timerColor }]}>{formatTime(timeLeft)}</Text>
          </View>
          <Text style={styles.headerTitle}>📝 {meta?.examName || "آزمون"}</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 80 }}>
          {questions.map((q, i) => (
            <View key={q.id} style={styles.qCard}>
              <Text style={styles.qNum}>سوال {i + 1}</Text>
              <Text style={styles.qText}>{q.text}</Text>

              {/* چهارگزینه‌ای */}
              {q.type === "multiple" && (
                <View style={styles.optionsCol}>
                  {(q.options || []).map((opt, oi) => (
                    <TouchableOpacity
                      key={oi}
                      style={[styles.optBtn, answers[q.id] === oi && styles.optBtnActive]}
                      onPress={() => setAnswers({ ...answers, [q.id]: oi })}
                    >
                      <Text style={[styles.optText, answers[q.id] === oi && styles.optTextActive]}>
                        {["الف", "ب", "ج", "د"][oi]}) {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* صحیح/غلط */}
              {q.type === "truefalse" && (
                <View style={styles.tfRow}>
                  {[{ v: "true", label: "✅ صحیح" }, { v: "false", label: "❌ غلط" }].map(t => (
                    <TouchableOpacity
                      key={t.v}
                      style={[styles.tfBtn, answers[q.id] === t.v && styles.tfBtnActive]}
                      onPress={() => setAnswers({ ...answers, [q.id]: t.v })}
                    >
                      <Text style={[styles.tfBtnText, answers[q.id] === t.v && { color: "#fff" }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* کوتاه‌پاسخ */}
              {(q.type === "short" || q.type === "descriptive") && (
                <TextInput
                  style={[styles.ansInput, q.type === "descriptive" && { minHeight: 100 }]}
                  placeholder={q.type === "descriptive" ? "پاسخ تشریحی خود را بنویسید..." : "پاسخ کوتاه..."}
                  placeholderTextColor="#bbb"
                  value={answers[q.id] || ""}
                  onChangeText={v => setAnswers({ ...answers, [q.id]: v })}
                  textAlign="right"
                  multiline={q.type === "descriptive"}
                  textAlignVertical={q.type === "descriptive" ? "top" : "center"}
                />
              )}
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={styles.submitBtn}
          onPress={() => handleSubmit(false)}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>✅ ثبت نهایی آزمون</Text>}
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // --------- صفحه نتیجه ---------
  const resultData = result || examData.result;
  const grading = resultData?.grading || examData?.result?.grading;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>✅ آزمون ثبت شد</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.successCard}>
          <Text style={styles.successIcon}>🎉</Text>
          <Text style={styles.successTitle}>آزمون با موفقیت ثبت شد</Text>
          <Text style={styles.successSub}>نتایج پس از تصحیح معلم اعلام خواهد شد</Text>
        </View>

        {grading && (
          <View style={styles.gradingCard}>
            <Text style={styles.gradingTitle}>📊 نتیجه تصحیح</Text>
            {grading.overall && (
              <View style={styles.overallBox}>
                <Text style={styles.overallLabel}>نمره / بازخورد کلی:</Text>
                <Text style={styles.overallVal}>{grading.overall}</Text>
              </View>
            )}
          </View>
        )}

        <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.replace("StudentLogin")}>
          <Text style={styles.homeBtnText}>← بازگشت به صفحه اصلی</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const C = { primary: "#10b981" };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f0fff4" },
  header: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: C.primary, padding: 16,
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "bold", flex: 1, textAlign: "right" },
  timer: {
    borderWidth: 2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  timerText: { fontSize: 18, fontWeight: "bold", fontVariant: ["tabular-nums"] },
  infoScroll: { padding: 16 },
  metaCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 14,
    marginBottom: 14, elevation: 2,
  },
  metaRow: { fontSize: 14, color: "#333", marginBottom: 6, textAlign: "right" },
  formCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, elevation: 2 },
  formTitle: { fontSize: 16, fontWeight: "bold", color: C.primary, marginBottom: 12, textAlign: "right" },
  fieldRow: { marginBottom: 10 },
  fieldLabel: { fontSize: 13, color: "#555", marginBottom: 4, textAlign: "right" },
  fieldInput: {
    borderWidth: 1.5, borderColor: "#ddd", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: "#333", backgroundColor: "#fafafa",
  },
  startBtn: {
    backgroundColor: C.primary, borderRadius: 12,
    padding: 16, alignItems: "center", marginTop: 12,
  },
  startBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  qCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14,
    marginBottom: 10, elevation: 1, borderRightWidth: 3, borderRightColor: C.primary,
  },
  qNum: { fontSize: 12, fontWeight: "bold", color: C.primary, marginBottom: 4, textAlign: "right" },
  qText: { fontSize: 15, color: "#333", marginBottom: 12, textAlign: "right", lineHeight: 24 },
  optionsCol: { gap: 8 },
  optBtn: {
    padding: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: "#ddd", backgroundColor: "#fafafa",
  },
  optBtnActive: { borderColor: C.primary, backgroundColor: "#f0fff4" },
  optText: { fontSize: 14, color: "#333", textAlign: "right" },
  optTextActive: { color: C.primary, fontWeight: "bold" },
  tfRow: { flexDirection: "row-reverse", gap: 12 },
  tfBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    borderWidth: 1.5, borderColor: "#ddd", alignItems: "center",
  },
  tfBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  tfBtnText: { fontWeight: "bold", color: "#333", fontSize: 14 },
  ansInput: {
    borderWidth: 1.5, borderColor: "#ddd", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: "#333", backgroundColor: "#fafafa", textAlignVertical: "top",
  },
  submitBtn: {
    margin: 12, backgroundColor: C.primary, borderRadius: 14,
    padding: 16, alignItems: "center",
  },
  submitBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  successCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 32,
    alignItems: "center", marginBottom: 16, elevation: 2,
  },
  successIcon: { fontSize: 56, marginBottom: 12 },
  successTitle: { fontSize: 20, fontWeight: "bold", color: C.primary, marginBottom: 6 },
  successSub: { fontSize: 14, color: "#888", textAlign: "center" },
  gradingCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 16, elevation: 1 },
  gradingTitle: { fontSize: 16, fontWeight: "bold", color: C.primary, marginBottom: 10, textAlign: "right" },
  overallBox: { backgroundColor: "#f0fff4", borderRadius: 10, padding: 12 },
  overallLabel: { fontSize: 13, color: "#666", marginBottom: 4, textAlign: "right" },
  overallVal: { fontSize: 15, color: "#333", textAlign: "right", fontWeight: "bold" },
  homeBtn: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1.5,
    borderColor: C.primary, padding: 16, alignItems: "center",
  },
  homeBtnText: { color: C.primary, fontWeight: "bold", fontSize: 15 },
});
