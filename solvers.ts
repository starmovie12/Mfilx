import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Native Node.js implementation of the hblinks.dad solver.
 * Ported from: https://github.com/starmovie12/hblinks.dad
 */
export async function solveHBLinks(url: string) {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    };

    const response = await axios.get(url, { headers, timeout: 15000 });

    if (response.status !== 200) {
      return { status: "fail", message: `Cannot open page. Status: ${response.status}` };
    }

    const $ = cheerio.load(response.data);
    
    // --- PRIORITY 1: HubCloud ---
    // Aisa link dhoondo jisme 'hubcloud.foo' ho
    const hubcloudLink = $('a[href*="hubcloud.foo"]').attr('href');
    
    if (hubcloudLink) {
      return {
        status: "success", 
        link: hubcloudLink, 
        source: "HubCloud (Priority 1)"
      };
    }
        
    // --- PRIORITY 2: HubDrive ---
    // Agar HubCloud nahi mila, to ye chalega
    const hubdriveLink = $('a[href*="hubdrive.space"]').attr('href');
    
    if (hubdriveLink) {
      return {
        status: "success", 
        link: hubdriveLink, 
        source: "HubDrive (Priority 2)"
      };
    }
        
    // --- PRIORITY 3: Not Found ---
    return { status: "fail", message: "Not Found" };

  } catch (e: any) {
    return { status: "error", message: e.message };
  }
}

/**
 * Native Node.js implementation of the movie link extractor.
 * Ported from: https://github.com/starmovie12/HdHub4umoviepageurl
 */
export async function extractMovieLinks(url: string) {
  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Referer": "https://hdhub4u.fo/"
  };

  const JUNK_DOMAINS = ["catimages", "imdb.com", "googleusercontent", "instagram.com", "facebook.com", "wp-content", "wpshopmart"];

  try {
    // Use fetch for lower overhead
    const response = await fetch(url, { headers: HEADERS });
    const html = await response.text();
    const $ = cheerio.load(html);

    const foundLinks: { name: string; link: string }[] = [];
    
    // Extract Metadata
    // Extract Metadata using the new function
    const metadata = extractMovieMetadata(html);

    // Optimized Extraction: Target download-related elements directly
    // This is much faster than scanning every single element in the DOM
    $('.entry-content a[href], main a[href]').each((_idx: number, el: any) => {
      const $a = $(el);
      const link = $a.attr('href') || '';
      const text = $a.text().trim();
      
      // Filter out junk immediately
      if (!link || link.startsWith('#') || JUNK_DOMAINS.some(junk => link.includes(junk))) return;
      
      // Check for known solver domains or download keywords
      const isTargetDomain = ["hblinks", "hubdrive", "hubcdn", "hubcloud", "gdflix", "drivehub"].some(d => link.includes(d));
      const isDownloadText = ["DOWNLOAD", "720P", "480P", "1080P", "4K", "DIRECT", "GDRIVE"].some(t => text.toUpperCase().includes(t));

      if (isTargetDomain || isDownloadText) {
        if (!foundLinks.some(x => x.link === link)) {
          // Try to find quality/name from parent or previous headers if text is empty
          let cleanName = text.replace(/⚡/g, "").trim();
          if (!cleanName || cleanName.length < 2) {
            const parent = $a.closest('p, div, h3, h4');
            const prev = parent.prev('h3, h4, h5, strong');
            cleanName = prev.text().trim() || parent.text().trim() || "Download Link";
          }
          
          foundLinks.push({ name: cleanName.substring(0, 50), link: link });
        }
      }
    });

    if (foundLinks.length === 0) {
      return { status: "error", message: "No links found. The page structure might have changed." };
    }

    return { 
      status: "success", 
      total: foundLinks.length, 
      links: foundLinks, 
      metadata 
    };

  } catch (e: any) {
    return { status: "error", message: e.message };
  }
}

/**
 * Extracts movie metadata (Quality, Languages, Audio Label) from HTML using a Smart 2-Step Extraction Strategy.
 * Grounded in the actual HTML structure of the target website.
 */
export function extractMovieMetadata(html: string) {
  const $ = cheerio.load(html);
  
  // Phase 1: Safe Content Area Definition
  const $content = $('.entry-content');
  
  if ($content.length === 0) {
    return { quality: "Unknown", languages: "Not Specified", audioLabel: "Unknown" };
  }

  // Phase 2: Dual-Source Extraction Logic
  
  // --- 1. Smart Language Extraction ---
  const validLanguages = ['Hindi', 'English', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Punjabi', 'Marathi', 'Bengali'];
  const matchedLanguages = new Set<string>();

  // Source A (Description): Exact <p> tag containing <strong>Language:</strong>
  const sourceA_LangText = $content.find('p').filter((_, el) => {
    return $(el).find('strong').text().includes('Language:');
  }).text();

  // Source B (Links Area): Scan text inside <h3> and <p> tags just before download <a> buttons
  const sourceB_Texts: string[] = [];
  $content.find('a[href]').each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href') || '';
    const isTargetDomain = ["hblinks", "hubdrive", "hubcdn", "hubcloud", "gdflix", "drivehub"].some(d => href.includes(d));
    
    if (isTargetDomain) {
      const $parent = $a.closest('p, div, h3, h4');
      sourceB_Texts.push($parent.text());
      
      // Look at immediate previous headers/paragraphs
      $parent.prevAll('h3, p').slice(0, 2).each((_, prevEl) => {
        sourceB_Texts.push($(prevEl).text());
      });
    }
  });

  const combinedLangText = (sourceA_LangText + " " + sourceB_Texts.join(" ")).toUpperCase();
  
  // Combine & Clean: Match valid languages, ignore junk
  validLanguages.forEach(lang => {
    const regex = new RegExp(`\\b${lang.toUpperCase()}\\b`, 'i');
    if (regex.test(combinedLangText)) {
      matchedLanguages.add(lang);
    }
  });

  const languagesArray = Array.from(matchedLanguages);
  const cleanLanguages = languagesArray.join(", ");

  // --- 2. Strict Audio Label Logic ---
  let audioLabel = "Unknown";
  if (languagesArray.length === 1) {
    audioLabel = languagesArray[0];
  } else if (languagesArray.length === 2) {
    audioLabel = "Dual Audio";
  } else if (languagesArray.length >= 3) {
    audioLabel = "Multi Audio";
  }

  // --- 3. Smart Highest Quality Extraction ---
  const resolutions = [
    { label: '4K', value: 5000 },
    { label: '2160p', value: 4000 },
    { label: '1080p', value: 3000 },
    { label: '720p', value: 2000 },
    { label: '480p', value: 1000 }
  ];
  const formats = ['WEB-DL', 'HDRip', 'Bluray', 'HEVC', '10Bit', 'UNCUT', 'WEB-RIP', 'DVDRIP'];

  // Source A (Description): Exact <p> tag containing <strong>Quality:</strong>
  const sourceA_QualityText = $content.find('p').filter((_, el) => {
    return $(el).find('strong').text().includes('Quality:');
  }).text();

  const combinedQualityText = (sourceA_QualityText + " " + sourceB_Texts.join(" ")).toUpperCase();
  
  // Calculate the Maximum Resolution
  let maxResValue = 0;
  let highestResLabel = "";
  
  resolutions.forEach(res => {
    if (combinedQualityText.includes(res.label.toUpperCase())) {
      if (res.value > maxResValue) {
        maxResValue = res.value;
        highestResLabel = res.label;
      }
    }
  });

  let finalQuality = "Unknown Quality";
  if (highestResLabel) {
    // Attach associated print format found in the text
    const foundFormats: string[] = [];
    formats.forEach(f => {
      if (combinedQualityText.includes(f.toUpperCase())) {
        foundFormats.push(f);
      }
    });
    const uniqueFormats = [...new Set(foundFormats)];
    finalQuality = `${highestResLabel} ${uniqueFormats.join(" ")}`.trim();
  }

  return {
    quality: finalQuality,
    languages: cleanLanguages || "Not Specified",
    audioLabel: audioLabel
  };
}

/**
 * Native Node.js implementation of HubCDN Bypass.
 * Ported from: https://github.com/starmovie12/hubcdn.-Bypass
 */
export async function solveHubCDN(url: string) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
  };

  try {
    let targetUrl = url;

    // Step 1: Get Real Target URL (Bypass intermediate redirect)
    if (!url.includes("/dl/")) {
      const resp = await axios.get(url, { headers, timeout: 15000 });
      const html = resp.data;
      
      const reurlMatch = html.match(/var reurl = "(.*?)"/);
      if (reurlMatch) {
        const redirectUrl = reurlMatch[1];
        const urlObj = new URL(redirectUrl);
        const rParam = urlObj.searchParams.get('r');
        
        if (rParam) {
          // Fix base64 padding
          const paddedB64 = rParam + "=".repeat((4 - rParam.length % 4) % 4);
          targetUrl = Buffer.from(paddedB64, 'base64').toString('utf-8');
        }
      }
    }

    // Step 2: Extract Final Link
    // Note: The original Python used Selenium. We'll try axios first.
    // If the site uses heavy JS, this might need further refinement.
    const finalResp = await axios.get(targetUrl, { headers, timeout: 20000 });
    const $ = cheerio.load(finalResp.data);
    
    const linkTag = $('a#vd');
    const finalLink = linkTag.attr('href');

    if (finalLink) {
      return { status: "success", final_link: finalLink };
    }

    // Fallback: Sometimes the link is in a script or meta refresh
    const scriptMatch = finalResp.data.match(/window\.location\.href\s*=\s*"(.*?)"/);
    if (scriptMatch) {
      return { status: "success", final_link: scriptMatch[1] };
    }

    return { status: "failed", message: "Link id='vd' not found in HTML" };

  } catch (e: any) {
    return { status: "error", message: e.message };
  }
}

/**
 * Native Node.js implementation of HubDrive solver.
 * Ported from: https://github.com/starmovie12/HdHub4u
 */
export async function solveHubDrive(url: string) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://hdhub4u.fo/"
  };

  try {
    const response = await axios.get(url, { headers, timeout: 15000 });
    const $ = cheerio.load(response.data);

    // HubDrive pages usually have a prominent download button
    // We look for common patterns used in the Python script
    let finalLink = "";

    // Pattern 1: a.btn-success (Common for HubDrive)
    const btnSuccess = $('a.btn-success[href*="hubcloud"]');
    if (btnSuccess.length > 0) {
      finalLink = btnSuccess.attr('href') || "";
    }

    // Pattern 2: a#dl
    if (!finalLink) {
      const dlBtn = $('a#dl');
      if (dlBtn.length > 0) {
        finalLink = dlBtn.attr('href') || "";
      }
    }

    // Pattern 3: Any link containing hubcloud or hubcdn
    if (!finalLink) {
      $('a[href]').each((_i: number, el: any) => {
        const href = $(el).attr('href') || "";
        if (href.includes('hubcloud') || href.includes('hubcdn')) {
          finalLink = href;
          return false; // break
        }
      });
    }

    if (finalLink) {
      return { status: "success", link: finalLink };
    }

    return { status: "fail", message: "Download link not found on HubDrive page" };

  } catch (e: any) {
    return { status: "error", message: e.message };
  }
}



