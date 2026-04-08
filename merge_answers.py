"""
merge_answers.py
Đọc answers.json (JSON format) và update voted_answer trong questions_db.json
"""
import json
import sys
from pathlib import Path

ANSWERS_FILE = Path("fuoverflow_images/SWT-SP26/answers.json")
QUESTIONS_FILE = Path("fuoverflow_images/SWT-SP26/questions_db.json")

def merge(answers_path: Path, questions_path: Path):
    with open(answers_path, "r", encoding="utf-8") as f:
        mapping = json.load(f)  # { "SWT301 SP26 FE_001.jpg": "E", ... }

    print(f"📋 Tìm thấy {len(mapping)} đáp án trong answers.json\n")

    with open(questions_path, "r", encoding="utf-8") as f:
        questions = json.load(f)

    updated = 0
    for q in questions:
        img = q.get("image_file", "")
        if img in mapping:
            old = q.get("voted_answer", "N/A")
            q["voted_answer"] = mapping[img]
            if old != mapping[img]:
                updated += 1
                print(f"  ✅ {img}: '{old}' → '{mapping[img]}'")

    with open(questions_path, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=4)

    has_answer = sum(1 for q in questions if q.get("voted_answer") not in ["N/A", None, ""])
    print(f"\n{'='*50}")
    print(f"✅ Đã cập nhật: {updated} câu")
    print(f"📊 Tổng câu có đáp án: {has_answer}/{len(questions)}")
    print(f"{'='*50}")

if __name__ == "__main__":
    if not ANSWERS_FILE.exists():
        print(f"❌ Không tìm thấy {ANSWERS_FILE}")
        sys.exit(1)
    merge(ANSWERS_FILE, QUESTIONS_FILE)
