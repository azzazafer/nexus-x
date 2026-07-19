import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { google } from 'googleapis';

export async function GET() {
  try {
    const parser = new Parser();
    const feeds = [
      'https://hnrss.org/frontpage?q=AI',
      'https://feeds.feedburner.com/TheHackersNews'
    ];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let markdownContent = `# Nexus-X Haftalık İstihbarat Raporu\n\nOluşturulma Tarihi: ${new Date().toISOString()}\n\n`;

    for (const feedUrl of feeds) {
      let feedString = '';
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(feedUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Nexus-X Bot' }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        feedString = await response.text();
      } catch (err: any) {
        console.error(`Fetch timeout or error for ${feedUrl}:`, err.message);
        markdownContent += `## Kaynak: ${feedUrl}\n\n`;
        markdownContent += `> Uyarı: Bu kaynağa erişilirken hata oluştu veya zaman aşımına uğradı (${err.message}).\n\n---\n\n`;
        continue;
      }

      let feed;
      try {
        feed = await parser.parseString(feedString);
      } catch (err: any) {
        console.error(`Parse error for ${feedUrl}:`, err.message);
        continue;
      }

      markdownContent += `## Kaynak: ${feed.title || feedUrl}\n\n`;

      const recentItems = feed.items.filter(item => {
        if (!item.isoDate) return false;
        const itemDate = new Date(item.isoDate);
        return itemDate >= sevenDaysAgo;
      });

      if (recentItems.length === 0) {
        markdownContent += `Son 7 güne ait haber bulunamadı.\n\n`;
      }

      for (const item of recentItems) {
        markdownContent += `### [${item.title}](${item.link})\n`;
        markdownContent += `**Tarih:** ${item.isoDate}\n\n`;
        if (item.contentSnippet || item.content) {
            const summary = (item.contentSnippet || item.content || '').replace(/<[^>]*>?/gm, '').trim();
            if (summary) {
                markdownContent += `> ${summary.substring(0, 300)}...\n\n`;
            }
        }
        markdownContent += `---\n\n`;
      }
    }

    const credentialsStr = process.env.GOOGLE_PRIVATE_KEY 
        ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : '';
        
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: credentialsStr,
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });
    const folderId = process.env.DRIVE_FOLDER_ID;

    if (!folderId) {
      throw new Error("DRIVE_FOLDER_ID is missing from environment variables.");
    }

    // List existing files in the folder
    const listResponse = await drive.files.list({
      q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name, mimeType)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const existingFiles = listResponse.data.files || [];

    if (existingFiles.length === 0) {
      return NextResponse.json({
        success: false,
        error: `Klasörde (ID: ${folderId}) hiç dosya bulunamadı. Lütfen klasörün içine bilgisayarınızdan 'Nexus_Rapor.txt' veya 'Nexus_Rapor.md' adında düz bir metin dosyası sürükleyip bırakın.`
      }, { status: 400 });
    }

    const targetFile = existingFiles[0];

    // Determine target mimeType
    // If it's a Google Doc (application/vnd.google-apps.document), update with text/plain
    const uploadMimeType = targetFile.mimeType === 'application/vnd.google-apps.document' 
      ? 'text/plain' 
      : 'text/markdown';

    const media = {
      mimeType: uploadMimeType,
      body: markdownContent
    };

    await drive.files.update({
      fileId: targetFile.id,
      media: media,
      supportsAllDrives: true,
    });

    return NextResponse.json({ 
      success: true, 
      message: `Rapor '${targetFile.name}' (${targetFile.mimeType}) dosyası üzerine başarıyla yazıldı.` 
    });

  } catch (error: any) {
    console.error('Hata:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
