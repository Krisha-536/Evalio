import io
from datetime import datetime
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

def generate_result_card_pdf(exam, student, attempt, result, topics):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()

    # Custom styles
    brand_style = ParagraphStyle(
        'Brand',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#4f46e5')
    )
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        alignment=TA_RIGHT,
        textColor=colors.HexColor('#0f172a')
    )
    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        alignment=TA_RIGHT,
        textColor=colors.HexColor('#64748b')
    )
    meta_label = ParagraphStyle(
        'MetaLabel',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#64748b')
    )
    meta_val = ParagraphStyle(
        'MetaVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#0f172a')
    )
    sec_title = ParagraphStyle(
        'SecTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#0f172a')
    )
    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        alignment=TA_CENTER
    )
    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        alignment=TA_CENTER
    )

    story = []

    # 1. Header
    header_data = [
        [
            Paragraph("<b>Evalio</b><br/><font size='8' color='#64748b'>Online Examination System</font>", brand_style),
            Paragraph("<b>OFFICIAL RESULT CARD</b><br/>" + f"Generated: {datetime.now().strftime('%d %b %Y, %I:%M %p')}", title_style)
        ]
    ]
    header_table = Table(header_data, colWidths=[260, 260])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#cbd5e1'), spaceBefore=5, spaceAfter=15))

    # 2. Student & Examination Information
    info_data = [
        [
            Paragraph("Student Name:", meta_label), Paragraph(str(student.get('name', '—')), meta_val),
            Paragraph("Student ID / Roll:", meta_label), Paragraph(str(student.get('enrollment_no', '—')), meta_val)
        ],
        [
            Paragraph("Course:", meta_label), Paragraph(str(student.get('course_name', '—')), meta_val),
            Paragraph("Subject:", meta_label), Paragraph(str(exam.get('subject', '—')), meta_val)
        ],
        [
            Paragraph("Examination:", meta_label), Paragraph(str(exam.get('exam_name', '—')), meta_val),
            Paragraph("Duration:", meta_label), Paragraph(f"{exam.get('duration', 0)} minutes", meta_val)
        ],
        [
            Paragraph("Submitted At:", meta_label), Paragraph(str(attempt.get('submitted_at', '—')[:19].replace('T', ' ')), meta_val),
            Paragraph("Status:", meta_label), Paragraph(str(attempt.get('status', 'Submitted')), meta_val)
        ]
    ]
    info_table = Table(info_data, colWidths=[90, 170, 100, 160])
    info_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#f1f5f9')),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 15))

    # 3. Overall Performance Summary
    story.append(Paragraph("Score & Performance Summary", sec_title))
    story.append(Spacer(1, 8))

    score_val = result.get('score', 0)
    total_marks = exam.get('total_marks', 0)
    pct = result.get('percentage', 0)
    status_str = result.get('result_status', 'Fail')
    status_color = colors.HexColor('#16a34a') if status_str == 'Pass' else colors.HexColor('#dc2626')

    summary_headers = ["Questions", "Attempted", "Correct", "Wrong", "Final Score", "Percentage", "Result"]
    summary_rows = [
        [
            Paragraph(str(result.get('total_questions', 0)), table_cell),
            Paragraph(str(result.get('attempted_questions', 0)), table_cell),
            Paragraph(str(result.get('correct_answers', 0)), table_cell),
            Paragraph(str(result.get('wrong_answers', 0)), table_cell),
            Paragraph(f"<b>{score_val:.1f} / {total_marks:.1f}</b>", table_cell_bold),
            Paragraph(f"<b>{pct:.1f}%</b>", table_cell_bold),
            Paragraph(f"<b><font color='{status_color.hexval()}'>{status_str.upper()}</font></b>", table_cell_bold)
        ]
    ]

    sum_table = Table([summary_headers] + summary_rows, colWidths=[70, 70, 65, 65, 90, 80, 80])
    sum_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#334155')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
    ]))
    story.append(sum_table)
    story.append(Spacer(1, 15))

    # 4. Topic-wise Performance
    if topics:
        story.append(Paragraph("Topic-wise Analysis", sec_title))
        story.append(Spacer(1, 8))

        topic_headers = ["Topic", "Total Questions", "Correct Answers", "Accuracy (%)"]
        topic_rows = []
        for t in topics:
            t_total = t.get('total', 1)
            t_corr = t.get('correct', 0)
            t_pct = round((t_corr / t_total) * 100) if t_total else 0
            topic_rows.append([
                Paragraph(t.get('topic', 'General'), ParagraphStyle('TopicLeft', parent=styles['Normal'], fontSize=9, fontName='Helvetica')),
                Paragraph(str(t_total), table_cell),
                Paragraph(str(t_corr), table_cell),
                Paragraph(f"{t_pct}%", table_cell_bold)
            ])

        topic_table = Table([topic_headers] + topic_rows, colWidths=[240, 90, 100, 90])
        topic_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f8fafc')),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ]))
        story.append(topic_table)
        story.append(Spacer(1, 15))

    # 5. Security & Verification Footer
    footer_text = f"""
    <b>Passing Criteria:</b> Minimum {exam.get('passing_marks', 0)} marks required to pass.<br/>
    <b>Marking Scheme:</b> Positive marking applied. Negative marking: {'Applied (-0.5 marks)' if exam.get('negative_marking') else 'Not Applied'}.<br/>
    <b>Integrity Log:</b> Tab-switch count recorded during session: {attempt.get('tab_switches', 0)}.<br/>
    <font color='#94a3b8'>This document is digitally verified and certified by the Evalio Online Examination System. System Ref: EVL-{exam.get('exam_id')}-{student.get('student_id')}-{datetime.now().strftime('%Y%m%d%H%M')}</font>
    """
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#cbd5e1'), spaceBefore=10, spaceAfter=10))
    story.append(Paragraph(footer_text, ParagraphStyle('Foot', parent=styles['Normal'], fontSize=8, leading=11, textColor=colors.HexColor('#64748b'))))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
