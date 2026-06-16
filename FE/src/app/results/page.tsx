"use client";

import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/api";
import {
  loadReviewResultPayloadFromIdb,
  parseReviewResultIdbMarker,
  removeReviewResultPayloadFromIdb,
} from "@/lib/scannerTransferStore";
import SharedBottomBar from "@/components/common/SharedBottomBar";

type ResultItem = Record<string, unknown>;

type ResultPayload = {
  batch_id?: string;
  results?: ResultItem[];
};
const RESULT_PAGE_SIZE = 25;

const METADATA_FIELDS: Array<{ key: string; label: string }> = [
  { key: "docId", label: "Mã tài liệu" },
  { key: "arcDocCode", label: "Mã hồ sơ tài liệu" },
  { key: "maintenance", label: "Chế độ bảo trì/lưu trữ" },
  { key: "typeName", label: "Loại văn bản" },
  { key: "codeNumber", label: "Số văn bản" },
  { key: "codeNotation", label: "Ký hiệu văn bản" },
  { key: "issuedDate", label: "Ngày ban hành" },
  { key: "organName", label: "Cơ quan ban hành" },
  { key: "subject", label: "Trích yếu nội dung" },
  { key: "language", label: "Ngôn ngữ" },
  { key: "numberOfPage", label: "Số trang" },
  { key: "inforSign", label: "Thông tin ký" },
  { key: "keyword", label: "Từ khóa" },
  { key: "mode", label: "Chế độ xử lý" },
  { key: "confidenceLevel", label: "Mức độ tin cậy" },
  { key: "autograph", label: "Chữ ký/khối ký" },
  { key: "format", label: "Định dạng tệp" },
  { key: "process", label: "Quy trình xử lý" },
  { key: "riskRecovery", label: "Rủi ro khôi phục" },
  { key: "riskRecoveryStatus", label: "Trạng thái rủi ro khôi phục" },
  { key: "description", label: "Mô tả" },
  { key: "isCan", label: "Cờ kiểm tra" },
];

function formatElapsedVi(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} giờ ${String(m).padStart(2, "0")} phút`;
  if (m > 0) return `${m} phút ${String(sec).padStart(2, "0")} giây`;
  return `${sec} giây`;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function stripTrailingArtifacts(text: string): string {
  return text
    .replace(/[⁄∕⧸]/g, " ")
    .replace(/\((?=[^)]*b\s*[/⁄∕⧸]\s*c)[^)]*\)/gim, " ")
    .replace(/\bb\s*[/⁄∕⧸]\s*c\b/gim, " ")
    .replace(/\s*---\s*PAGE\s+\d+\s*\/\s*\d+\s*---\s*/gim, " ")
    .replace(/\s*---\s*PAGE\s+\d+\s+OCR\s*---\s*/gim, " ")
    .replace(/\s*\[\s*TEXT_LAYER\s*\]\s*/gim, " ")
    .replace(/\s*\[\s*OCR_TEXT\s*\]\s*/gim, " ")
    .replace(/^\s*---\s*PAGE\s+\d+\s*\/\s*\d+\s*---\s*$/gim, "")
    .replace(/^\s*---\s*PAGE\s+\d+\s+OCR\s*---\s*$/gim, "")
    .replace(/^\s*\[\s*TEXT_LAYER\s*\]\s*$/gim, "")
    .replace(/^\s*\[\s*OCR_TEXT\s*\]\s*$/gim, "")
    .replace(/\[\s*OCR_TIMEOUT\s*\]/gi, "")
    .replace(/\s*[_-]{1,}\s*$/g, "")
    .replace(/[,\-;:/\\]+(?:\s*)$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeWhitespacePreserveLines(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isLikelyGibberishLine(line: string): boolean {
  const compact = line.replace(/\s/g, "");
  if (!compact) return true;

  const letters = (line.match(/[A-Za-zÀ-Ỹà-ỹ]/g) ?? []).length;
  const digits = (line.match(/\d/g) ?? []).length;
  const weird = (line.match(/[~`^<>|\\_=*]/g) ?? []).length;
  const punctuation = (line.match(/[^\w\sÀ-Ỹà-ỹ]/g) ?? []).length;

  if (weird >= 1) return true;
  if (compact.length <= 2) return true;
  if (letters === 0 && digits > 0) return true;
  if (letters > 0 && digits >= 2 && digits >= letters) return true;
  if (letters > 0 && punctuation >= letters && letters <= 6) return true;
  return false;
}

function cleanOcrNoiseText(text: string): string {
  if (!text) return "";

  const baseline = stripTrailingArtifacts(text);
  let cleaned = baseline;
  cleaned = cleaned.replace(/\((?:d|đ)[eéèẻẽẹ]\s*b\/c\)\s*;?/gim, "");
  cleaned = cleaned.replace(/\([^)]{0,40}b\s*\/\s*c[^)]{0,40}\)\s*;?/gim, "");
  cleaned = cleaned.replace(/\bb\s*\/\s*c\b/gi, "");
  cleaned = cleaned.replace(/\b[^\s]{0,3}wat\b/gim, "");
  cleaned = cleaned.replace(/\b\w*0n\w*\b/gim, "");
  cleaned = cleaned.replace(/\b\w*[\\|/=*~`^<>]\w*\b/g, "");

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isLikelyGibberishLine(line));

  const mergedLines: string[] = [];
  const shouldMergeWithNext = (line: string): boolean => {
    const upper = line.toUpperCase();
    if (/^(KT|TM)\.\s*$/.test(upper)) return true;
    if (/^(KT|TM)\.\s+[A-ZÀ-Ỹ]/.test(upper)) return true;
    if (/^[A-ZÀ-Ỹ\s.,()]{2,40}$/.test(line) && !/[;:]$/.test(line) && !line.startsWith("-")) return true;
    return false;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const next = lines[index + 1];

    if (next && shouldMergeWithNext(current) && !next.startsWith("-")) {
      mergedLines.push(`${current} ${next}`.replace(/\s+/g, " ").trim());
      index += 1;
      continue;
    }

    mergedLines.push(current);
  }

  const normalized = normalizeWhitespacePreserveLines(mergedLines.join("\n"));
  if (normalized) return normalized;
  return normalizeWhitespacePreserveLines(baseline);
}

function formatLongVietnameseText(text: string): string {
  if (!text) return "";

  const normalizeAppendixRomanNoise = (input: string): string => {
    return input
      // OCR hay nham "H" thay cho "II" trong "Phụ lục": HI -> II, HII -> III, ...
      .replace(/\b(Phụ\s*lục)\s+H([IVXLCDM]{1,6})(\s+[A-Z])?\b/gi, (_m, p1, p2, p3 = "") => {
        return `${p1} I${String(p2).toUpperCase()}${p3}`;
      })
      // Truong hop chi co "H" roi den ky tu phu luc, vd: "Phụ lục H B" -> "Phụ lục II B"
      .replace(/\b(Phụ\s*lục)\s+H(\s+[A-Z])\b/gi, "$1 II$2");
  };

  const normalizeBracketPairs = (input: string): string => {
    const pairMap: Record<string, string> = {
      ")": "(",
      "]": "[",
      "}": "{",
    };
    const openSet = new Set(["(", "[", "{"]);
    const stack: string[] = [];
    const output: string[] = [];

    for (const char of input) {
      if (openSet.has(char)) {
        stack.push(char);
        output.push(char);
        continue;
      }

      if (char in pairMap) {
        const expectedOpen = pairMap[char];
        if (stack.length > 0 && stack[stack.length - 1] === expectedOpen) {
          stack.pop();
          output.push(char);
        }
        continue;
      }

      output.push(char);
    }

    // Loai ngoac mo du neu khong co ngoac dong tuong ung.
    const pending: Record<string, number> = { "(": 0, "[": 0, "{": 0 };
    stack.forEach((ch) => {
      pending[ch] += 1;
    });

    if (pending["("] + pending["["] + pending["{"] === 0) {
      return output.join("");
    }

    for (let i = output.length - 1; i >= 0; i -= 1) {
      const ch = output[i];
      if (pending[ch] > 0) {
        output.splice(i, 1);
        pending[ch] -= 1;
      }
      if (pending["("] + pending["["] + pending["{"] === 0) break;
    }

    return output.join("");
  };

  const removeDanglingFragment = (line: string): string => {
    const compact = line.trim();
    if (!compact) return compact;
    if (/[.!?…]$/.test(compact)) return compact;

    // Cat duoi "nua voi" do OCR bi cut, vd: "... , Cả"
    const danglingTailMatch = compact.match(/^(.*[,;:])\s*([A-ZÀ-Ỹ][a-zà-ỹ]{0,4})\s*$/);
    if (danglingTailMatch) {
      return danglingTailMatch[1].trim();
    }

    return compact;
  };

  const removeOcrShortNoise = (line: string): string => {
    return line
      // Xoa manh OCR rac kieu "2 v", "v 2" sau dau cau/phan tach.
      .replace(/([:;,.!?]\s*)(\d+\s+[A-Za-zÀ-Ỹà-ỹ])(?=\s|$)/g, "$1")
      .replace(/([:;,.!?]\s*)([A-Za-zÀ-Ỹà-ỹ]\s+\d+)(?=\s|$)/g, "$1")
      // Xoa cum ngan dung le o cuoi dong.
      .replace(/\b\d+\s+[A-Za-zÀ-Ỹà-ỹ]\s*$/g, "")
      // Yêu cầu khoảng trắng trước chữ để tránh cắt giữa từ tiếng Việt như "năm 2026" → "nă"
      .replace(/\s[A-Za-z]\s+\d+\s*$/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  };

  const normalized = normalizeAppendixRomanNoise(text)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,\s*,+/g, ", ")
    .replace(/([:;,.!?])([A-Za-zÀ-Ỹà-ỹ0-9])/g, "$1 $2")
    .replace(/;\s+/g, ";\n")
    .replace(/\.\s+(?=[A-ZÀ-Ỹa-zà-ỹ0-9])/g, ".\n")
    .replace(/\s+([a-z]\))/g, "\n$1");

  // Giữ nguyên các cụm đánh số/mục lục trên cùng dòng với nội dung theo dạng tổng quát:
  // 1. ..., 10. ..., 1.1 ..., 1) ..., a) ..., I. ...
  const mergedMarkers = normalized
    .replace(/(\b\d+(?:\.\d+)*)\.\n(?=\S)/g, "$1. ")
    .replace(/(\b\d+)\)\n(?=\S)/g, "$1) ")
    .replace(/\b([A-Za-zÀ-Ỹà-ỹ])\)\n(?=\S)/g, "$1) ")
    .replace(/\b([IVXLCDM]+)\.\n(?=\S)/g, "$1. ");

  // Tách các đầu mục ra dòng riêng theo kiểu văn bản hành chính:
  // ...: 1. ... -> ...:\n1. ...
  // ...; 2. ... -> ...;\n2. ...
  // hỗ trợ cả 1., 1.1, 2), a), I.
  return mergedMarkers
    // Chi tach dong cho gach dau dong (liet ke) neu sau dau cau hoac sau dau xuong dong.
    // Khong tach voi truong hop noi trong cau, vd: "2021 - 2030".
    .replace(/(^|\n|[:;])\s*-\s+(?=\S)/g, "$1\n- ")
    .replace(/([:;])\s+((?:\d+(?:\.\d+)*\.|\d+\)|[A-Za-zÀ-Ỹà-ỹ]\)|[IVXLCDM]+\.))\s+/g, "$1\n$2 ")
    .replace(/([^\n])\s+((?:\d+(?:\.\d+)*\.|\d+\)|[A-Za-zÀ-Ỹà-ỹ]\)|[IVXLCDM]+\.))\s+(?=[A-ZÀ-Ỹa-zà-ỹ])/g, "$1\n$2 ")
    .replace(/(^|[\s(])(Điều|Khoản|Mục|Chương)\s*\n\s*(\d+(?:\.\d+)*[\.\)]?)/gim, "$1$2 $3")
    .replace(/\b(\d{4})\s*-\s*(\d{4})\b/g, "$1 - $2")
    .split("\n")
    .map((line) => removeDanglingFragment(line))
    .map((line) => removeOcrShortNoise(line))
    .join("\n")
    .split("\n")
    .map((line) => normalizeBracketPairs(line))
    .join("\n")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,\s*,+/g, ", ")
    .split("\n")
    .map((line) => line.replace(/[,\-;:/\\]+(?:\s*)$/g, "").trim())
    .join("\n")
    .trim();
}

function formatSignatureText(text: string, mode: "compact" | "full" = "compact"): string {
  if (!text) return "";

  const normalizeCommonAdminTitleNoise = (input: string): string => {
    return input
      // OCR hay lam hong "KT. THỦ TƯỚNG" thanh "KT.aARY TƯỚNG", "KT.ARY TƯỚNG", ...
      .replace(/\bKT\.\s*[A-Za-zÀ-Ỹà-ỹ]{1,6}\s+TƯỚNG\b/gi, "KT. THỦ TƯỚNG")
      // OCR sai "PHÓ" thanh "RHO"/"PHC" trong ngu canh chuc danh.
      .replace(/\bRHO\s+THỦ\s+TƯỚNG\b/gi, "PHÓ THỦ TƯỚNG")
      .replace(/\bPHC\s+THỦ\s+TƯỚNG\b/gi, "PHÓ THỦ TƯỚNG")
      .replace(/\bPHC\s+([A-ZÀ-Ỹ][^;,\n]{0,60}\bCHÍNH\s+PHỦ)\b/gi, "PHÓ $1")
      .replace(/\bPHC(?=\s+(?:Thủ\s+tướng|Phó\s+Thủ\s+tướng|Bộ\s+trưởng|Chủ\s+tịch|Chính\s+phủ))/gi, "PHÓ")
      // Bo ky tu OCR rac thuong gap.
      .replace(/[ˆ]/g, " ")
      .replace(/\bẺ\b/g, " ")
      // Chuan hoa khoang trang quanh dau cham viet tat.
      .replace(/\b(KT|TM)\s*\.\s*/gi, (_m, p1) => `${String(p1).toUpperCase()}. `);
  };

  const isLikelyGarbageToken = (token: string): boolean => {
    const raw = token.trim();
    if (!raw) return true;
    const normalized = raw.replace(/^[,.;:()\-–—]+|[,.;:()\-–—]+$/g, "");
    if (!normalized) return true;

    if (/[~`^<>|\\_=*#@©ˆ]/.test(normalized)) return true;
    if (/[&]/.test(normalized) && !/^[A-Za-zÀ-Ỹà-ỹ]{1,3}&[A-Za-zÀ-Ỹà-ỹ]{1,3}$/.test(normalized)) return true;

    const letters = (normalized.match(/[A-Za-zÀ-Ỹà-ỹ]/g) ?? []).length;
    const digits = (normalized.match(/\d/g) ?? []).length;
    const nonWord = (normalized.match(/[^A-Za-zÀ-Ỹà-ỹ0-9]/g) ?? []).length;

    if (letters === 0 && digits > 0) return true;
    if (letters > 0 && digits >= letters) return true;
    if (letters > 0 && nonWord > letters) return true;
    if (letters <= 2 && digits > 0) return true;
    if (/^(?:Ẻ|RHO|PHC)$/i.test(normalized)) return true;

    return false;
  };

  const scrubGarbageTokens = (line: string): string => {
    const parts = line.split(/\s+/).filter(Boolean);
    const kept = parts.filter((token) => !isLikelyGarbageToken(token));
    return kept.join(" ").replace(/\s+([,.;:!?])/g, "$1").trim();
  };

  const isLikelyVietnameseSignatureLine = (line: string): boolean => {
    const normalized = line.trim();
    if (!normalized) return false;

    const letters = (normalized.match(/[A-Za-zÀ-Ỹà-ỹ]/g) ?? []).length;
    if (letters < 2) return false;

    const weird = (normalized.match(/[~`^<>|\\_=*#@]/g) ?? []).length;
    if (weird > 0) return false;

    const badPunctRuns = normalized.match(/[^\w\sÀ-Ỹà-ỹ.,:;()\-\/]{2,}/g);
    if (badPunctRuns && badPunctRuns.length > 0) return false;

    const upper = normalized.toUpperCase();
    const vietnameseHints = [
      "THỦ TƯỚNG",
      "PHÓ THỦ TƯỚNG",
      "BỘ TRƯỞNG",
      "CHỦ NHIỆM",
      "CHỦ TỊCH",
      "PHÓ CHỦ TỊCH",
      "THỨ TRƯỞNG",
      "VĂN PHÒNG",
      "UBND",
      "QUỐC HỘI",
      "TÒA ÁN",
      "VIỆN KIỂM SÁT",
      "KT.",
      "TM.",
      "NGƯỜI KÝ",
      "PHẠM",
      "NGUYỄN",
      "TRẦN",
      "LÊ ",
      "VŨ ",
      "ĐỖ ",
      "BÙI ",
      "HỒ ",
    ];
    if (vietnameseHints.some((hint) => upper.includes(hint))) return true;

    const digits = (normalized.match(/\d/g) ?? []).length;
    if (digits > 0 && digits >= letters) return false;

    // Cho phep cau tieng Viet thong thuong voi dau cau co ban.
    return /^[A-Za-zÀ-Ỹà-ỹ0-9\s.,:;()\-\/]+$/.test(normalized);
  };

  const splitAndFilterSignatureSegments = (line: string): string[] => {
    const compacted = line
      .replace(/\s*;\s*/g, ";\n")
      .replace(/\s+-\s+(?=[A-ZÀ-Ỹ])/g, "\n")
      .split("\n")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => scrubGarbageTokens(part))
      .map((part) => part.replace(/[,\-;:/\\]+(?:\s*)$/g, "").trim())
      .filter(Boolean);

    return compacted.filter((part) => isLikelyVietnameseSignatureLine(part) && !isLikelyGibberishLine(part));
  };

  const baseline = normalizeWhitespacePreserveLines(normalizeCommonAdminTitleNoise(stripTrailingArtifacts(text)));
  const cleaned = cleanOcrNoiseText(normalizeCommonAdminTitleNoise(text))
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*/g, ";\n")
    .replace(/\s+-\s+/g, "\n- ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  const safeCleaned = (cleaned || baseline)
    .split("\n")
    .map((line) => scrubGarbageTokens(line))
    .filter(Boolean)
    .join("\n");

  const lines = safeCleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const signatureKeywords = [
    "TM.",
    "KT.",
    "THỦ TƯỚNG",
    "PHÓ THỦ TƯỚNG",
    "BỘ TRƯỞNG",
    "CHỦ TỊCH",
    "PHÓ CHỦ TỊCH",
    "THỨ TRƯỞNG",
    "GIÁM ĐỐC",
  ];

  function looksLikeGarbage(line: string): boolean {
    const noSpace = line.replace(/\s/g, "");
    if (noSpace.length <= 2) return true;
    if (/[_=*<>~`|]/.test(line)) return true;
    const alpha = (line.match(/[A-Za-zÀ-Ỹà-ỹ]/g) ?? []).length;
    const digitsAndSymbols = (line.match(/[^A-Za-zÀ-Ỹà-ỹ\s]/g) ?? []).length;
    return alpha > 0 && digitsAndSymbols > alpha;
  }

  const meaningful = lines.flatMap((line) => splitAndFilterSignatureSegments(line)).filter((line) => {
    const upper = line.toUpperCase();
    const hasKeyword = signatureKeywords.some((keyword) => upper.includes(keyword));
    if (hasKeyword) return true;
    if (line.startsWith("-")) return false;
    return (
      !looksLikeGarbage(line) &&
      !isLikelyGibberishLine(line) &&
      isLikelyVietnameseSignatureLine(line) &&
      line.length <= 120
    );
  });

  const deduped = meaningful.filter((line, idx) => meaningful.indexOf(line) === idx);

  const preferred = deduped.filter((line) =>
    signatureKeywords.some((keyword) => line.toUpperCase().includes(keyword)),
  );

  const lineLimit = mode === "full" ? 999 : 4;
  const finalLines = (preferred.length ? preferred : deduped).slice(0, lineLimit);
  if (finalLines.length > 0) return finalLines.join("\n");

  const fallback = lines
    .flatMap((line) => splitAndFilterSignatureSegments(line))
    .filter((line) => !looksLikeGarbage(line) && !isLikelyGibberishLine(line) && isLikelyVietnameseSignatureLine(line))
    .slice(0, lineLimit)
    .join("\n");
  if (fallback) return fallback;
  return baseline
    .split("\n")
    .map((line) => scrubGarbageTokens(line))
    .map((line) => line.replace(/[,\-;:/\\]+(?:\s*)$/g, "").trim())
    .filter((line) => isLikelyVietnameseSignatureLine(line) && !isLikelyGibberishLine(line))
    .slice(0, lineLimit)
    .filter(Boolean)
    .join("\n");
}

function getDisplayValue(item: ResultItem, key: string): string {
  const repairSubjectDateTail = (text: string): string => {
    if (!text) return text;
    const issuedDateRaw = formatCellValue(item.issuedDate || item.issued_date);
    let yearHint = "";
    const m = issuedDateRaw.match(/^\s*\d{1,2}\/\d{1,2}\/(\d{4})\s*$/);
    if (m) yearHint = m[1];

    let fixed = text.replace(
      /(ngày\s+\d{1,2}\s+tháng\s+\d{1,2})\s+nă\b(?!m)/gi,
      "$1 năm",
    );
    if (yearHint) {
      fixed = fixed.replace(
        /(ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm)\s*$/gi,
        `$1 ${yearHint}`,
      );
    }
    return fixed;
  };

  if (key === "docId") {
    const stripFileExtension = (value: string): string => {
      if (!value) return "";
      // Bo duoi mo rong o cuoi ten file cho moi truong hop extension.
      return value.replace(/\.[A-Za-z0-9]{1,10}$/g, "");
    };

    const sourceFilename = formatCellValue(item.source_filename);
    if (sourceFilename) return stripTrailingArtifacts(stripFileExtension(sourceFilename));

    const raw = formatCellValue(item.docId);
    if (!raw) return "";
    const parts = raw.split(":");
    const docIdValue = parts.length > 1 ? parts[parts.length - 1] : raw;
    return stripTrailingArtifacts(stripFileExtension(docIdValue));
  }

  if (key === "mode") {
    const rawMode = formatCellValue(item.mode);
    const modeMap: Record<string, string> = {
      ollama_local_llm: "Bóc tách bằng AI nội bộ (Ollama)",
      rule_based: "Bóc tách theo luật (rule-based)",
      rule_based_fallback_after_llm_error: "AI lỗi, chuyển sang bóc tách theo luật",
      failed: "Xử lý thất bại",
    };
    return stripTrailingArtifacts(modeMap[rawMode] ?? rawMode);
  }

  if (key === "description") {
    const rawDescription = formatCellValue(item.description);
    const descriptionMap: Record<string, string> = {
      "Extracted by local rule-based fallback for Vietnamese legal/administrative documents.":
        "Dữ liệu được bóc tách bằng phương pháp dự phòng theo luật cho văn bản pháp lý/hành chính tiếng Việt.",
    };
    return stripTrailingArtifacts(descriptionMap[rawDescription] ?? rawDescription);
  }

  const plainText = stripTrailingArtifacts(formatCellValue(item[key]));
  if (key === "subject" || key === "description") {
    return repairSubjectDateTail(formatLongVietnameseText(plainText));
  }
  if (key === "inforSign" || key === "autograph") {
    const signatureText = formatSignatureText(plainText, "compact");
    return signatureText || plainText;
  }

  return plainText;
}

function getFullOcrValue(item: ResultItem, key: string): string {
  const raw = formatCellValue(item[key]);
  if (!raw.trim()) return "";
  if (key === "autograph") {
    const cleaned = formatSignatureText(raw, "full");
    return cleaned || stripTrailingArtifacts(raw);
  }
  return stripTrailingArtifacts(raw);
}

function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function getPaginationPages(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current - 1 > 2) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current + 1 < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}

const styles = {
  page: {
    height: "100vh",
    background: "#f3f4f6",
    color: "#354052",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: "0",
    padding: "0 16px 72px",
    overflow: "hidden",
    boxSizing: "border-box" as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif',
  },
  paginationBar: {
    background: "#ffffff",
    borderTop: "1px solid #e2e8f0",
    borderRadius: 0,
    padding: "8px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "4px",
    flexShrink: 0,
  },
  pageBtn: {
    width: "32px",
    height: "32px",
    border: "none",
    background: "transparent",
    color: "#374151",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: 400,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    flexShrink: 0,
  },
  pageBtnActive: {
    background: "#08337B",
    color: "#fff",
    fontWeight: 600,
  },
  pageBtnIcon: {
    padding: "8px",
    border: "none",
    background: "transparent",
    borderRadius: "6px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  panel: {
    background: "#ffffff",
    borderRadius: 0,
    border: "1px solid #e2e8f0",
    padding: "12px",
    overflowY: "auto",
    overflowX: "hidden",
    minHeight: 0,
  },
  fileTitle: {
    margin: "0 0 10px",
    fontSize: "16px",
    fontWeight: 700,
    color: "#ffffff",
    background: "#0b3a8e",
    borderRadius: 0,
    padding: "10px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    textAlign: "center",
  },
  fileTitlePath: {
    opacity: 0.95,
    fontWeight: 500,
    fontSize: "14px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "48vw",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#fff",
    tableLayout: "fixed",
  },
  colMeta: {
    width: "33.33%",
  },
  colValue: {
    width: "66.67%",
  },
  th: {
    border: "1px solid #d7deea",
    background: "#f8fafc",
    color: "#334155",
    textAlign: "left",
    padding: "10px 12px",
    fontSize: "14px",
  },
  td: {
    border: "1px solid #d7deea",
    color: "#1f2937",
    padding: "10px 12px",
    fontSize: "14px",
    verticalAlign: "top",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  noData: {
    fontSize: "15px",
    color: "#64748b",
    padding: "10px",
    textAlign: "center",
  },
  outlineWrapper: {
    display: "flex",
    minHeight: 0,
    overflow: "hidden",
    border: "1px solid #e2e8f0",
    background: "#fff",
  },
  outlinePanel: {
    width: 220,
    background: "#fafbfc",
    borderRight: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column" as const,
    flexShrink: 0,
    overflow: "hidden",
  },
  outlineHeader: {
    height: 48,
    padding: "0 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #f1f5f9",
    flexShrink: 0,
    boxSizing: "border-box" as const,
  },
  outlineList: {
    overflowY: "auto" as const,
    flex: 1,
    padding: "4px 0",
  },
  outlineItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    width: "100%",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "background 0.12s",
  },
  outlineItemActive: {
    background: "#EEF4FF",
  },
  outlineBadge: {
    flexShrink: 0,
    width: 20,
    height: 20,
    borderRadius: 4,
    background: "#08337B",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  outlineBadgeInactive: {
    background: "#e2e8f0",
    color: "#94a3b8",
  },
  mainPanel: {
    flex: 1,
    overflowY: "auto" as const,
    overflowX: "hidden",
    padding: "12px",
    minHeight: 0,
  },
  toastStack: {
    position: "fixed",
    right: "16px",
    top: "16px",
    zIndex: 60,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minWidth: "260px",
    maxWidth: "340px",
  },
  toastItem: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "10px",
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    boxShadow: "0 2px 8px rgba(34,197,94,0.12)",
  },
  toastCheck: {
    flexShrink: 0,
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    background: "#22c55e",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 700,
  },
  toastText: {
    flex: 1,
    fontSize: "13px",
    color: "#166534",
    fontWeight: 500,
  },
  toastClose: {
    flexShrink: 0,
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#4ade80",
    fontSize: "14px",
    padding: "0 2px",
    lineHeight: 1,
  },
} as const;

export default function ResultsPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [hasLoadedPayload, setHasLoadedPayload] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showFullSignatureByFile, setShowFullSignatureByFile] = useState<Record<number, boolean>>({});
  const [summaryToast, setSummaryToast] = useState<{ files: string; time: string } | null>(null);
  const [resultPage, setResultPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [jumpToIndex, setJumpToIndex] = useState<number | null>(null);

  const results = useMemo(() => payload?.results ?? [], [payload]);
  const [editedResults, setEditedResults] = useState<Record<string, string>[]>([]);
  const totalPages = Math.max(1, Math.ceil(results.length / RESULT_PAGE_SIZE));
  const safePage = Math.min(resultPage, totalPages);
  const pageStartIndex = (safePage - 1) * RESULT_PAGE_SIZE;
  const pagedResults = results.slice(pageStartIndex, pageStartIndex + RESULT_PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;

    async function hydrateResultPayload() {
      const raw = sessionStorage.getItem("review_result_payload");
      let parsed: ResultPayload | null = null;

      if (raw) {
        const idbResultId = parseReviewResultIdbMarker(raw);
        if (idbResultId) {
          parsed = await loadReviewResultPayloadFromIdb<ResultPayload>(idbResultId);
          await removeReviewResultPayloadFromIdb(idbResultId);
        } else {
          try {
            parsed = JSON.parse(raw) as ResultPayload;
          } catch {
            parsed = null;
          }
        }
      }

      const nextEdited = (parsed?.results ?? []).map((item) => {
        const editableRow: Record<string, string> = {};
        METADATA_FIELDS.forEach((field) => {
          editableRow[field.key] = getDisplayValue(item, field.key);
        });
        return editableRow;
      });

      if (!cancelled) {
        setPayload(parsed);
        setEditedResults(nextEdited);
        setHasLoadedPayload(true);
      }

      const rawSummary = sessionStorage.getItem("review_extraction_summary");
      if (rawSummary) {
        try {
          const summary = JSON.parse(rawSummary) as { total_elapsed_ms?: number; total_files?: number };
          const totalSec = Math.max(0, Math.ceil((summary.total_elapsed_ms ?? 0) / 1000));
          const totalFiles = summary.total_files ?? 0;
          if (!cancelled) {
            setSummaryToast({
              files: `Đã bóc tách ${totalFiles} file.`,
              time: `Thời gian bóc tách: ${formatElapsedVi(totalSec)}.`,
            });
          }
        } catch {
          if (!cancelled) {
            setSummaryToast({ files: "Đã hoàn tất bóc tách.", time: "" });
          }
        } finally {
          sessionStorage.removeItem("review_extraction_summary");
        }
      }
    }

    void hydrateResultPayload();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!summaryToast) return;
    const timer = window.setTimeout(() => setSummaryToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [summaryToast]);

  function handleValueChange(resultIndex: number, key: string, value: string) {
    setEditedResults((prev: Record<string, string>[]) => {
      const next = [...prev];
      next[resultIndex] = {
        ...(next[resultIndex] ?? {}),
        [key]: value,
      };
      return next;
    });
  }

  function toggleFullSignature(resultIndex: number) {
    const isShowingFull = !!showFullSignatureByFile[resultIndex];
    const nextShowFull = !isShowingFull;
    const item = results[resultIndex];
    const compactValue = item ? getDisplayValue(item, "autograph") : "";
    const fullValue = item ? getFullOcrValue(item, "autograph") : "";

    setEditedResults((prev: Record<string, string>[]) => {
      const next = [...prev];
      const currentRow = { ...(next[resultIndex] ?? {}) };
      const currentValue = currentRow.autograph ?? "";
      const currentModeCanonical = isShowingFull ? fullValue : compactValue;
      const nextModeCanonical = nextShowFull ? fullValue : compactValue;

      // Chi dong bo theo mode khi gia tri hien tai van trung voi gia tri mode cu.
      // Neu user da sua tay thi giu nguyen.
      if (normalizeForCompare(currentValue) === normalizeForCompare(currentModeCanonical)) {
        currentRow.autograph = nextModeCanonical;
        next[resultIndex] = currentRow;
      }

      return next;
    });

    setShowFullSignatureByFile((prev: Record<number, boolean>) => ({
      ...prev,
      [resultIndex]: nextShowFull,
    }));
  }

  function autoResizeTextArea(target: HTMLTextAreaElement) {
    target.style.height = "auto";
    target.style.height = `${target.scrollHeight}px`;
  }

  useEffect(() => {
    const elements = document.querySelectorAll("textarea[data-auto-grow='true']");
    elements.forEach((element) => autoResizeTextArea(element as HTMLTextAreaElement));
  }, [editedResults.length, JSON.stringify(showFullSignatureByFile), safePage]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (jumpToIndex === null) return;
    const el = document.getElementById(`result-file-${jumpToIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setJumpToIndex(null);
    }
  }, [safePage, jumpToIndex]);

  async function handleExportExcel() {
    if (!payload?.results || payload.results.length === 0) {
      return;
    }

    const exportResults = payload.results.map((item: ResultItem, index) => {
      const edited = editedResults[index] ?? {};
      const merged: ResultItem = { ...item };

      METADATA_FIELDS.forEach((field) => {
        merged[field.key] = edited[field.key] ?? "";
      });

      return merged;
    });

    const exportPayload: ResultPayload = {
      ...payload,
      results: exportResults,
    };

    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/export-excel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(exportPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Xuất Excel thất bại.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `ket_qua_boc_tach_${Date.now()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <style jsx global>{`
        /* Custom scrollbar */
        .results-main-panel::-webkit-scrollbar,
        .results-outline-list::-webkit-scrollbar {
          width: 5px;
        }
        .results-main-panel::-webkit-scrollbar-track,
        .results-outline-list::-webkit-scrollbar-track {
          background: transparent;
        }
        .results-main-panel::-webkit-scrollbar-thumb,
        .results-outline-list::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 99px;
        }
        .results-main-panel::-webkit-scrollbar-thumb:hover,
        .results-outline-list::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        /* Hover on sidebar file items */
        .results-outline-btn:hover {
          background: #f1f5f9 !important;
        }
        .results-outline-btn[data-active="true"]:hover {
          background: #dbeafe !important;
        }
        /* Hover on table rows */
        .results-table tbody tr:hover td {
          background: #f8fafc;
        }
        /* Hover on sidebar toggle button */
        .results-sidebar-toggle:hover {
          background: #f1f5f9 !important;
        }
        /* Hover on back button */
        .results-back-btn:hover {
          color: #08337B !important;
        }
        .results-back-btn:hover svg {
          stroke: #08337B;
        }
      `}</style>
      <header style={{ margin: "0 -16px", padding: "12px 16px", background: "#fff", borderBottom: "1px solid #DDE2EB", boxShadow: "0 1px 2px rgba(15,23,42,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          type="button"
          onClick={() => router.push("/media")}
          className="results-back-btn"
          style={{ border: 0, background: "transparent", color: "#4B5563", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 600, lineHeight: 1, padding: 0, transition: "color 0.15s ease" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: 20, height: 20 }}>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Quay lại trang chủ</span>
        </button>
        <h1 style={{ margin: 0, textAlign: "center", fontSize: 16, fontWeight: 600, color: "#374151" }}>Kết quả bóc tách (22 trường metadata)</h1>
        <div style={{ width: 44 }} />
      </header>

      <div style={styles.outlineWrapper}>
        {/* Sidebar outline */}
        <aside style={{ ...styles.outlinePanel, width: sidebarOpen ? 220 : 48, transition: "width 0.25s ease" }}>
          {sidebarOpen ? (
            /* ── MỞ: header trên, list dưới ── */
            <>
              <div style={{ ...styles.outlineHeader }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.07em", textTransform: "uppercase" as const }}>Danh sách tệp</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 600, background: "#f1f5f9", borderRadius: 4, padding: "1px 5px" }}>{results.length}</span>
                  <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Thu gọn" className="results-sidebar-toggle" style={{ border: "none", background: "transparent", cursor: "pointer", padding: 2, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", borderRadius: 4, transition: "background 0.15s ease" }}>
                    <img src="/icons/chevron-left.svg" width={20} height={20} alt="" draggable={false} />
                  </button>
                </div>
              </div>
              <div style={styles.outlineList} className="results-outline-list">
                {results.map((item, idx) => {
                  const filename = formatCellValue(item.source_filename) || `File ${idx + 1}`;
                  const shortName = filename.replace(/\.[^/.]+$/, "");
                  const isActive = idx >= pageStartIndex && idx < pageStartIndex + RESULT_PAGE_SIZE;
                  return (
                    <button key={idx} type="button" onClick={() => { const p = Math.ceil((idx + 1) / RESULT_PAGE_SIZE); setResultPage(p); setJumpToIndex(idx); }} className="results-outline-btn" data-active={isActive ? "true" : undefined} style={{ ...styles.outlineItem, ...(isActive ? styles.outlineItemActive : {}) }} title={shortName}>
                      <span style={{ ...styles.outlineBadge, ...(isActive ? {} : styles.outlineBadgeInactive), flexShrink: 0 }}>{idx + 1}</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontSize: 12, color: isActive ? "#08337B" : "#475467", fontWeight: isActive ? 600 : 400 }}>{shortName}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            /* ── THU GỌN: toggle trên | badges dưới ── */
            <div style={{ display: "flex", flexDirection: "column" as const, flex: 1, overflow: "hidden" }}>
              {/* Hàng trên: toggle */}
              <div style={{ height: 48, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #f1f5f9" }}>
                <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Mở danh sách" className="results-sidebar-toggle" style={{ border: "none", background: "transparent", cursor: "pointer", padding: 2, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", borderRadius: 4, transition: "background 0.15s ease" }}>
                  <img src="/icons/chevron-right.svg" width={20} height={20} alt="" draggable={false} />
                </button>
              </div>
              {/* Hàng dưới: badges */}
              <div style={{ flex: 1, overflowY: "auto" as const, padding: "4px 0" }} className="results-outline-list">
                {results.map((item, idx) => {
                  const isActive = idx >= pageStartIndex && idx < pageStartIndex + RESULT_PAGE_SIZE;
                  return (
                    <button key={idx} type="button" onClick={() => { const p = Math.ceil((idx + 1) / RESULT_PAGE_SIZE); setResultPage(p); setJumpToIndex(idx); }} className="results-outline-btn" data-active={isActive ? "true" : undefined} style={{ ...styles.outlineItem, justifyContent: "center", padding: "7px 0", ...(isActive ? styles.outlineItemActive : {}) }}>
                      <span style={{ ...styles.outlineBadge, ...(isActive ? {} : styles.outlineBadgeInactive) }}>{idx + 1}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* Main panel + pagination */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <section style={styles.mainPanel} className="results-main-panel">
        {!hasLoadedPayload ? (
          <div style={styles.noData}>Đang tải dữ liệu kết quả...</div>
        ) : results.length === 0 ? (
          <div style={styles.noData}>Chưa có dữ liệu kết quả.</div>
        ) : (
          <>
          {pagedResults.map((item, pageIndex) => {
            const index = pageStartIndex + pageIndex;
            return (
            <div key={`result-${index}`} id={`result-file-${index}`} style={{ marginBottom: pageIndex === pagedResults.length - 1 ? 0 : 16 }}>
              <p style={styles.fileTitle}>
                <span aria-hidden="true" style={{ width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#ffffff" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 24, height: 24 }}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"
                    />
                  </svg>
                </span>
                <span>Kết quả bóc tách File {index + 1}</span>
                <span style={styles.fileTitlePath}>/ {formatCellValue(item.source_filename)}</span>
              </p>
              <table style={styles.table} className="results-table">
                <colgroup>
                  <col style={styles.colMeta} />
                  <col style={styles.colValue} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={styles.th}>Trường metadata</th>
                    <th style={styles.th}>Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {METADATA_FIELDS.map((field) => (
                    <tr key={`${index}-${field.key}`}>
                      <td style={styles.td}>{field.label}</td>
                      <td style={styles.td}>
                        <textarea
                          data-auto-grow="true"
                          value={editedResults[index]?.[field.key] ?? ""}
                          onChange={(event) => handleValueChange(index, field.key, event.target.value)}
                          onInput={(event) => autoResizeTextArea(event.currentTarget)}
                          rows={field.key === "subject" || field.key === "description" ? 6 : 2}
                          style={{
                            width: "100%",
                            border: 0,
                            borderRadius: 0,
                            padding: 0,
                            fontSize: "14px",
                            lineHeight: 1.45,
                            fontFamily:
                              '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif',
                            resize: "vertical",
                            background: "transparent",
                            color: "#1f2937",
                            whiteSpace: "pre-wrap",
                            outline: "none",
                            overflow: "auto",
                            minHeight: field.key === "subject" || field.key === "description" ? "132px" : "46px",
                            maxHeight: field.key === "subject" || field.key === "description" || field.key === "keyword" ? "220px" : "120px",
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            );
          })}
          </>
        )}
        </section>
        <div style={styles.paginationBar}>
          <button
            type="button"
            onClick={() => setResultPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            aria-label="Trang trước"
            style={{ ...styles.pageBtnIcon, opacity: safePage === 1 ? 0.5 : 1, cursor: safePage === 1 ? "not-allowed" : "pointer" }}
          >
            <img src="/icons/chevron-left.svg" width={20} height={20} alt="" draggable={false} />
          </button>
          {getPaginationPages(safePage, totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} style={{ width: 32, textAlign: "center", lineHeight: "32px", color: "#9CA3AF", fontSize: "13px" }}>…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setResultPage(p)}
                aria-label={`Trang ${p}`}
                aria-current={safePage === p ? "page" : undefined}
                style={{ ...styles.pageBtn, ...(safePage === p ? styles.pageBtnActive : null) }}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => setResultPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            aria-label="Trang sau"
            style={{ ...styles.pageBtnIcon, opacity: safePage === totalPages ? 0.5 : 1, cursor: safePage === totalPages ? "not-allowed" : "pointer" }}
          >
            <img src="/icons/chevron-right.svg" width={20} height={20} alt="" draggable={false} />
          </button>
        </div>
        </div>
      </div>

      <SharedBottomBar
        leftLabel="Quay lại"
        leftIcon={<span aria-hidden="true">←</span>}
        onLeftClick={() => router.push("/media")}
        rightLabel={loading ? "Đang xuất..." : "Xuất Excel"}
        rightIcon={<span aria-hidden="true">⇅</span>}
        rightDisabled={loading}
        onRightClick={handleExportExcel}
        fixedBottom
        centerContent={null}
      />
      {summaryToast ? (
        <div style={styles.toastStack}>
          <div style={styles.toastItem}>
            <span style={styles.toastCheck}>✓</span>
            <span style={styles.toastText}>{summaryToast.files}</span>
            <button type="button" style={styles.toastClose} onClick={() => setSummaryToast(null)}>×</button>
          </div>
          {summaryToast.time ? (
            <div style={styles.toastItem}>
              <span style={styles.toastCheck}>✓</span>
              <span style={styles.toastText}>{summaryToast.time}</span>
              <button type="button" style={styles.toastClose} onClick={() => setSummaryToast(null)}>×</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
