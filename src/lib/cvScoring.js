import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Common English words that carry no signal about job fit — filtered out
// before comparing CV text against the job description.
const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","else","for","of","to","in","on",
  "at","by","with","from","as","is","are","was","were","be","been","being",
  "this","that","these","those","it","its","i","you","he","she","we","they",
  "will","would","can","could","should","shall","may","might","must","have",
  "has","had","do","does","did","not","no","so","than","too","very","just",
  "about","into","over","after","before","between","up","down","out","off",
  "our","your","their","his","her","them","who","which","what","when","where",
  "how","all","any","each","other","some","such","only","own","same","also",
  "years","year","experience","work","working","job","role","team","company",
]);

/**
 * Extracts plain text from a PDF File object, entirely in the browser.
 */
export async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    fullText += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return fullText;
}

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z][a-z+#.]{1,}/g) || []).filter(
    (word) => word.length > 2 && !STOPWORDS.has(word)
  );
}

/**
 * Scores how well a candidate's CV text matches a job's requirements.
 * Returns { score (0-100), matchedKeywords, missingKeywords }.
 *
 * Approach: pull the most meaningful/frequent keywords out of the job's
 * requirements + responsibilities + description, then check what fraction
 * of those keywords actually appear in the CV text. This is a simple,
 * transparent heuristic (not AI/ML) — good enough to flag obviously
 * unrelated CVs, while HR can always open the PDF and judge manually too.
 */
export function computeMatchScore(cvText, job) {
  const jobText = [job.requirements, job.responsibilities, job.description, job.title]
    .filter(Boolean)
    .join(" ");

  const jobWords = tokenize(jobText);
  if (jobWords.length === 0) return { score: null, matchedKeywords: [], missingKeywords: [] };

  // Rank job keywords by frequency, keep the top ~25 as "required" signals
  const freq = {};
  jobWords.forEach((w) => (freq[w] = (freq[w] || 0) + 1));
  const rankedKeywords = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 25);

  const cvWordSet = new Set(tokenize(cvText));

  const matchedKeywords = rankedKeywords.filter((k) => cvWordSet.has(k));
  const missingKeywords = rankedKeywords.filter((k) => !cvWordSet.has(k));

  const score = Math.round((matchedKeywords.length / rankedKeywords.length) * 100);

  return { score, matchedKeywords, missingKeywords };
}
