/* =========================================================
   Evalio – Reports module: PDF result cards and Excel export
   (uses jsPDF + jsPDF-AutoTable and SheetJS, loaded per page)
   ========================================================= */
const Exporter = (() => {
  const INDIGO = [79, 70, 229];

  function header(doc, title, subtitle) {
    doc.setFillColor(...INDIGO);
    doc.roundedRect(14, 14, 9, 9, 2, 2, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('E', 18.5, 20.3, { align: 'center' });
    doc.setTextColor(27, 24, 64); doc.setFontSize(13); doc.text('Evalio', 26, 20.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(115, 119, 145);
    doc.text('Secure Online Examination System', 26, 24.5);
    doc.text(`Generated ${EV.fmtDateTime(EV.nowIso())}`, doc.internal.pageSize.getWidth() - 14, 20.5, { align: 'right' });
    doc.setDrawColor(230, 231, 240); doc.line(14, 30, doc.internal.pageSize.getWidth() - 14, 30);
    doc.setTextColor(27, 24, 64); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(title, 14, 42);
    if (subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(115, 119, 145); doc.text(subtitle, 14, 48); }
  }

  /** One student's result card (PDF). */
  function resultCard(result) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const exam = DB.get('examinations', result.exam_id);
    const st = DB.get('students', result.student_id);
    header(doc, 'Examination Result Card', `${exam.exam_name} · ${Exams.courseName(exam.course_id)}`);

    doc.autoTable({
      startY: 56, theme: 'plain', styles: { fontSize: 10, cellPadding: 2.2 },
      columnStyles: { 0: { textColor: [115, 119, 145], cellWidth: 45 }, 1: { fontStyle: 'bold', textColor: [27, 24, 64] } },
      body: [
        ['Student name', st.name], ['Student ID', st.enrollment_no], ['Email', st.email],
        ['Examination', exam.exam_name], ['Subject', exam.subject || '—'],
        ['Date', EV.fmtDateTime(result.generated_at)], ['Time taken', EV.fmtDuration(result.time_taken)]
      ]
    });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Total questions', 'Attempted', 'Correct', 'Wrong', 'Score', 'Percentage', 'Status']],
      body: [[result.total_questions, result.attempted_questions, result.correct_answers, result.wrong_answers,
        `${result.score} / ${exam.total_marks}`, `${result.percentage}%`, result.result_status]],
      headStyles: { fillColor: INDIGO, fontSize: 8.5 }, styles: { halign: 'center', fontSize: 10 }
    });
    const y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(8.5); doc.setTextColor(115, 119, 145);
    doc.text(`Passing marks: ${exam.passing_marks} / ${exam.total_marks}${exam.negative_marking ? ' · Negative marking applied' : ''}`, 14, y);
    doc.text('This is a system generated result card and does not require a signature.', 14, y + 5);
    doc.save(`Evalio_Result_${st.enrollment_no}_${exam.exam_name.replace(/\W+/g, '_')}.pdf`);
  }

  /** Generic table report (PDF). */
  function tablePdf(title, subtitle, head, rows, filename, landscape = false) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait' });
    header(doc, title, subtitle);
    doc.autoTable({ startY: 54, head: [head], body: rows, headStyles: { fillColor: INDIGO, fontSize: 8.5 }, styles: { fontSize: 8.5 }, alternateRowStyles: { fillColor: [248, 248, 252] } });
    doc.save(filename);
  }

  /** Excel workbook from { sheetName: [ {col: val}, ... ] }. */
  function excel(filename, sheets) {
    const wb = XLSX.utils.book_new();
    Object.entries(sheets).forEach(([name, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31)));
    XLSX.writeFile(wb, filename);
  }

  return { resultCard, tablePdf, excel };
})();
