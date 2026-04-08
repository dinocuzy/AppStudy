"""
ISTQB Question Scraper - softwaretestinggenius.com
Cài đặt: pip install requests beautifulsoup4 pandas openpyxl
Chạy: python scrape.py
"""

import requests
from bs4 import BeautifulSoup, NavigableString
import json
import time
import re
import pandas as pd
from urllib.parse import urljoin

BASE_URL = "https://www.softwaretestinggenius.com"
INDEX_URL = f"{BASE_URL}/certifications-resources/istqb-foundation-exam-sample-question-papers/"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

session = requests.Session()
session.headers.update(HEADERS)

# Regex pattern matching question page URLs
# e.g., /istqb-certification-exam-sample-papers-q-61-to-70/
QUESTION_URL_PATTERN = re.compile(
    r"istqb-certification-exam-sample-papers-q-\d+-to-\d+", re.IGNORECASE
)

# --- Regex patterns ---
# Câu hỏi: Q. 1:, Q.1, Q1 :, >Q. 157: ...
Q_PATTERN = re.compile(r"^[>“”\" ]*Q\.?\s*(\d+)\s*[:.]?\s*(.+)", re.IGNORECASE | re.DOTALL)

# Option: A. ... hoặc A) ... (đầu dòng)
OPT_PATTERN = re.compile(r"^([A-Da-d])\s*[.)]\s*(.+)", re.DOTALL)

# Tìm option nhúng trong text (ở giữa dòng): ...textA. option text
OPT_EMBEDDED = re.compile(r"([A-D])\.\s+(.+)")

# Phần đáp án ở cuối trang
ANSWER_SECTION = re.compile(
    r"Correct\s+Answer|Answers?\s+to\s+(?:Earlier|Previous)|Answer\s+Key",
    re.IGNORECASE,
)
ANSWER_SECTION_EXCLUDE = re.compile(r"at\s+the\s+end\s+of\s+this\s+page", re.IGNORECASE)

# Đáp án riêng lẻ: Q. 51 – (C), Q51 - C, Q. 51 : C, etc.
ANSWER_ITEM = re.compile(r"Q\.?\s*(\d+)\s*[-–:]\s*\(?([A-Da-d])\)?", re.IGNORECASE)

# Dòng ngăn cách giữa các câu hỏi
SEPARATOR = re.compile(r"[<=>{}\-]{5,}")


def get_question_links():
    """Lấy tất cả link câu hỏi từ trang index (bao gồm phân trang)."""
    all_links = []
    page_num = 1

    while True:
        if page_num == 1:
            url = INDEX_URL
        else:
            url = f"{INDEX_URL}page/{page_num}/"

        print(f"[*] Đang lấy danh sách link từ trang {page_num}: {url}")

        try:
            resp = session.get(url, timeout=15)
            if resp.status_code == 404:
                print(f"  -> Trang {page_num} không tồn tại, dừng phân trang.")
                break
            resp.raise_for_status()
        except requests.exceptions.HTTPError:
            break
        except Exception as e:
            print(f"  [!] Lỗi khi tải trang index: {e}")
            break

        soup = BeautifulSoup(resp.text, "html.parser")
        found_on_page = 0

        for a in soup.find_all("a", href=True):
            href = a["href"]
            if QUESTION_URL_PATTERN.search(href):
                full_url = urljoin(BASE_URL, href)
                if full_url not in all_links:
                    all_links.append(full_url)
                    found_on_page += 1

        print(f"  -> Tìm thấy {found_on_page} link mới trên trang {page_num}")

        if found_on_page == 0:
            break

        # Kiểm tra có trang tiếp theo không
        next_link = soup.find("a", string=re.compile(r"Older posts|Next|›|»", re.I))
        if not next_link:
            nav = soup.find("div", class_="nav-links")
            if nav:
                next_a = nav.find("a", class_="next")
                if not next_a:
                    break
            else:
                break

        page_num += 1
        time.sleep(1)

    # Sắp xếp link theo số thứ tự câu hỏi
    def extract_start_q(url_str):
        m = re.search(r"q-(\d+)-to-", url_str)
        return int(m.group(1)) if m else 0

    all_links.sort(key=extract_start_q)

    print(f"\n[+] Tổng cộng tìm thấy {len(all_links)} link câu hỏi")
    return all_links


def _extract_all_lines(content):
    """
    Lấy tất cả các dòng text từ vùng nội dung chính.
    Duyệt toàn bộ block elements để giữ đúng thứ tự.
    """
    lines = []
    current_line = []
    
    BLOCK_TAGS = {
        'br', 'p', 'div', 'tr', 'td', 'th', 'li', 'ul', 'ol', 
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'article', 'main', 'section'
    }
    
    for element in content.descendants:
        if isinstance(element, NavigableString):
            text = str(element)
            current_line.append(text)
        elif element.name in BLOCK_TAGS:
            if current_line:
                joined = "".join(current_line)
                cleaned = re.sub(r'\s+', ' ', joined).strip()
                if cleaned:
                    lines.append(cleaned)
                current_line = []
                
    if current_line:
        joined = "".join(current_line)
        cleaned = re.sub(r'\s+', ' ', joined).strip()
        if cleaned:
            lines.append(cleaned)
            
    return lines


def _split_question_and_options(text):
    """
    Xử lý trường hợp câu hỏi và option A bị dính liền nhau.
    Ví dụ: "Which is not a testing principleA. Early testing"
    Trả về (question_text, [embedded_option_lines])
    """
    # Tìm vị trí option A đầu tiên bị nhúng trong text
    # Pattern: text ngay trước A. (không có khoảng trắng hoặc có)
    match = re.search(r"(?<=[a-z?.])\s*([A-D])\.\s+", text)
    if match:
        q_text = text[: match.start()].strip()
        remaining = text[match.start() :]

        # Tách remaining thành từng option
        option_lines = []
        # Split bởi pattern B./C./D. ở đầu hoặc sau newline
        parts = re.split(r"(?=\b[A-D]\.\s)", remaining)
        for part in parts:
            part = part.strip()
            if part:
                option_lines.append(part)

        return q_text, option_lines

    return text, []


def parse_questions_from_page(url):
    """Trích xuất câu hỏi và đáp án từ một trang."""
    print(f"  -> Đang cào: {url}")
    try:
        resp = session.get(url, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"  [!] Lỗi: {e}")
        return [], []

    soup = BeautifulSoup(resp.text, "html.parser")

    # Xoá script, style
    for tag in soup.find_all(["script", "style"]):
        tag.decompose()

    # Tìm vùng nội dung chính: div.entry-content
    content = soup.find("div", class_=re.compile(r"entry-content"))
    if not content:
        article = soup.find("article")
        if article:
            content = article.find("div", class_=re.compile(r"entry|content|post"))
        if not content:
            content = soup.find("main") or soup.body
    if not content:
        print("  [!] Không tìm thấy vùng nội dung chính")
        return [], []

    answers_section = []
    in_answers_section = False

    # === TRÍCH XUẤT ĐÁP ÁN TỪ TABLE TRƯỚC ===
    for table in content.find_all("table"):
        for tr in table.find_all("tr"):
            tds = tr.find_all(["td", "th"])
            if len(tds) >= 2:
                q_text = tds[0].get_text(strip=True)
                a_text = tds[1].get_text(strip=True)
                m = re.search(r"Q\.?\s*(\d+)", q_text, re.IGNORECASE)
                if m:
                    m_ans = re.search(r"([A-Da-d])", a_text)
                    if m_ans:
                        ans_dict = {"number": int(m.group(1)), "answer": m_ans.group(1).upper()}
                        if ans_dict not in answers_section:
                            answers_section.append(ans_dict)

    # Lấy tất cả dòng text
    lines = _extract_all_lines(content)

    questions = []
    current_q = None

    for line in lines:
        line = line.strip()
        if not line or len(line) < 3:
            continue

        # Bỏ qua dòng ngăn cách
        if SEPARATOR.match(line):
            continue

        # === PHẦN ĐÁP ÁN Ở CUỐI TRANG ===
        if ANSWER_SECTION.search(line) and not ANSWER_SECTION_EXCLUDE.search(line):
            in_answers_section = True
            # Cũng trích xuất đáp án nếu có trên cùng dòng
            for m in ANSWER_ITEM.finditer(line):
                ans_dict = {"number": int(m.group(1)), "answer": m.group(2).upper()}
                if ans_dict not in answers_section:
                    answers_section.append(ans_dict)
            continue

        if in_answers_section:
            for m in ANSWER_ITEM.finditer(line):
                ans_dict = {"number": int(m.group(1)), "answer": m.group(2).upper()}
                if ans_dict not in answers_section:
                    answers_section.append(ans_dict)
            continue

        # === CÂU HỎI ===
        q_match = Q_PATTERN.match(line)
        if q_match:
            # Lưu câu hỏi trước đó
            if current_q:
                questions.append(current_q)

            q_num = int(q_match.group(1))
            q_text_raw = q_match.group(2).strip()

            # Xử lý option bị dính liền với câu hỏi
            q_text, embedded_opts = _split_question_and_options(q_text_raw)

            current_q = {
                "number": q_num,
                "question": q_text,
                "options": {},
                "answer": None,
                "source_url": url,
            }

            # Parse các option nhúng
            for opt_line in embedded_opts:
                _parse_option(opt_line, current_q)

            continue

        # === OPTION CHO CÂU HỎI HIỆN TẠI ===
        if current_q:
            _parse_option(line, current_q)

    # Lưu câu hỏi cuối cùng
    if current_q:
        questions.append(current_q)

    return questions, answers_section


def _parse_option(text, current_q):
    """Phân tích một dòng text để tìm option A/B/C/D."""
    text = text.strip()
    if not text:
        return

    # Pattern: A. ... hoặc A) ... hoặc A: ...
    opt_match = OPT_PATTERN.match(text)
    if opt_match:
        key = opt_match.group(1).upper()
        value = opt_match.group(2).strip()
        if key in ("A", "B", "C", "D") and value:
            current_q["options"][key] = value


def scrape_all():
    """Hàm chính: cào tất cả trang và lưu kết quả."""
    # Lấy danh sách link
    links = get_question_links()

    if not links:
        print("[!] Không tìm thấy link nào. Dùng danh sách mặc định...")
        links = []
        for start in range(1, 1061, 10):
            end = start + 9
            links.append(
                f"{BASE_URL}/istqb-certification-exam-sample-papers-q-{start}-to-{end}/"
            )

    all_questions = []
    all_answers = []

    for i, url in enumerate(links, 1):
        print(f"\n[{i}/{len(links)}] Xử lý: {url}")
        qs, ans = parse_questions_from_page(url)
        all_questions.extend(qs)
        all_answers.extend(ans)
        print(f"  => Lấy được {len(qs)} câu hỏi, {len(ans)} đáp án (bộ trước)")
        time.sleep(1.5)

    # Ghép đáp án vào câu hỏi
    # Đáp án cho bộ câu hỏi X nằm ở trang chứa bộ X+10
    answer_map = {}
    for ans in all_answers:
        answer_map[ans["number"]] = ans["answer"]

    matched_count = 0
    for q in all_questions:
        if q["answer"] is None and q["number"] in answer_map:
            q["answer"] = answer_map[q["number"]]
            matched_count += 1

    print(f"\n[✓] Đã ghép {matched_count} đáp án từ các trang kế tiếp")
    print(f"[✓] Tổng cộng: {len(all_questions)} câu hỏi")

    # Thống kê
    with_answer = sum(1 for q in all_questions if q["answer"])
    with_options = sum(1 for q in all_questions if len(q["options"]) >= 2)
    print(f"    - Có đáp án: {with_answer}/{len(all_questions)}")
    print(f"    - Có >= 2 options: {with_options}/{len(all_questions)}")

    # --- Lưu JSON ---
    with open("istqb_questions.json", "w", encoding="utf-8") as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)
    print("[✓] Đã lưu: istqb_questions.json")

    # --- Lưu Excel ---
    rows = []
    for q in all_questions:
        rows.append(
            {
                "STT": q["number"],
                "Câu hỏi": q["question"],
                "A": q["options"].get("A", ""),
                "B": q["options"].get("B", ""),
                "C": q["options"].get("C", ""),
                "D": q["options"].get("D", ""),
                "Đáp án đúng": q["answer"] or "",
                "Nguồn": q["source_url"],
            }
        )

    df = pd.DataFrame(rows)
    df.to_excel("istqb_questions.xlsx", index=False, engine="openpyxl")
    print("[✓] Đã lưu: istqb_questions.xlsx")

    return all_questions


if __name__ == "__main__":
    scrape_all()