"""Quick test: scrape 2 pages to verify logic."""
from scrape import parse_questions_from_page, get_question_links
import json

# Test trên 2 trang
test_urls = [
    "https://www.softwaretestinggenius.com/istqb-certification-exam-sample-papers-q-61-to-70/",
    "https://www.softwaretestinggenius.com/istqb-certification-exam-sample-papers-q-71-to-80/",
]

all_qs = []
all_ans = []

for url in test_urls:
    qs, ans = parse_questions_from_page(url)
    all_qs.extend(qs)
    all_ans.extend(ans)
    print(f"  Questions: {len(qs)}, Answers (prev set): {len(ans)}")

# Build answer map
answer_map = {a["number"]: a["answer"] for a in all_ans}
for q in all_qs:
    if q["answer"] is None and q["number"] in answer_map:
        q["answer"] = answer_map[q["number"]]

print(f"\n=== RESULTS ===")
print(f"Total questions: {len(all_qs)}")
for q in all_qs:
    opts = ", ".join(f"{k}={v[:30]}" for k, v in sorted(q["options"].items()))
    print(f"  Q{q['number']}: {q['question'][:70]}...")
    print(f"    Options: {opts}")
    print(f"    Answer: {q['answer']}")
