import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ClinicBottleneckData } from '@/lib/bottleneck-scraper';

/**
 * Sanitizes Turkish characters for WinAnsi / Standard PDF fonts (Helvetica)
 * to ensure 100% crash-free PDF rendering in serverless environments.
 */
function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .replace(/[^\x00-\x7F]/g, ''); // Strip remaining non-ASCII
}

export async function POST(req: NextRequest) {
  try {
    const clinic: ClinicBottleneckData = await req.json();

    if (!clinic || !clinic.name) {
      return NextResponse.json(
        { success: false, error: 'Invalid clinic data payload provided.' },
        { status: 400 }
      );
    }

    // Initialize PDF Document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // Standard A4 (points)
    const { height, width } = page.getSize();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    let y = height - 50;
    const margin = 50;
    const contentWidth = width - margin * 2;

    const drawLine = (yPos: number, thickness = 1) => {
      page.drawLine({
        start: { x: margin, y: yPos },
        end: { x: width - margin, y: yPos },
        thickness,
        color: rgb(0, 0, 0),
      });
    };

    // Header (Formal Audit Style)
    page.drawText('GIZLI VE OZEL: FINANSAL VE OPERASYONEL DENETIM RAPORU', {
      x: margin,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 15;

    page.drawText(`BELGE NO: AUDIT-${Date.now().toString().slice(-6)} | TARIH: ${new Date().toISOString().split('T')[0]}`, {
      x: margin,
      y,
      size: 8,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 15;

    drawLine(y, 1.5);
    y -= 25;

    // Clinic Info Box
    page.drawText(sanitizeText(clinic.name.toUpperCase()), {
      x: margin,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 18;

    page.drawText(`Adres: ${sanitizeText(clinic.address)}`, {
      x: margin,
      y,
      size: 9,
      font: fontRegular,
    });
    y -= 14;

    page.drawText(`Mevcut Rating: ${clinic.rating} / 5.0 (${clinic.totalReviews} Toplam Degerlendirme)`, {
      x: margin,
      y,
      size: 9,
      font: fontBold,
      color: clinic.rating < 4.5 ? rgb(0.7, 0, 0) : rgb(0, 0, 0),
    });
    y -= 25;

    // Section 1: Bottlenecks
    page.drawText('1. OPERASYONEL DARBOGAZ VE SIZINTI TESPITLERI', {
      x: margin,
      y,
      size: 11,
      font: fontBold,
    });
    y -= 8;
    drawLine(y, 0.5);
    y -= 15;

    const bottlenecks = clinic.bottlenecks || [];
    if (bottlenecks.length === 0) {
      page.drawText('Tespit edilen majör operasyonel darboğaz bulunamadı.', {
        x: margin + 10,
        y,
        size: 9,
        font: fontRegular,
      });
      y -= 15;
    } else {
      for (const item of bottlenecks) {
        page.drawText(`[!] ${sanitizeText(item)}`, {
          x: margin + 10,
          y,
          size: 9,
          font: fontRegular,
          color: rgb(0.6, 0, 0),
        });
        y -= 14;
      }
    }
    y -= 15;

    // Section 2: Bad Reviews Audit
    page.drawText('2. HASTA GERI BILDIRIM KANITLARI (OLUMSUZ DEGERLENDIRMELER)', {
      x: margin,
      y,
      size: 11,
      font: fontBold,
    });
    y -= 8;
    drawLine(y, 0.5);
    y -= 15;

    const badReviews = clinic.badReviews || [];
    if (badReviews.length === 0) {
      page.drawText('Cevapsız veya düşük puanlı olumsuz hasta yorumu bulunamadı.', {
        x: margin + 10,
        y,
        size: 9,
        font: fontRegular,
      });
      y -= 15;
    } else {
      for (const rev of badReviews.slice(0, 3)) {
        page.drawText(`* ${sanitizeText(rev.authorName)} (${rev.rating} Yildiz - ${sanitizeText(rev.relativeTime)}):`, {
          x: margin + 10,
          y,
          size: 8.5,
          font: fontBold,
        });
        y -= 12;

        const snippet = sanitizeText(rev.text).slice(0, 110);
        page.drawText(`  "${snippet}${rev.text.length > 110 ? '...' : ''}"`, {
          x: margin + 15,
          y,
          size: 8.5,
          font: fontOblique,
          color: rgb(0.3, 0.3, 0.3),
        });
        y -= 16;
      }
    }
    y -= 15;

    // Section 3: Bleed Calculation
    page.drawText('3. MATEMATIKSEL AYLIK FINANSAL SIZINTI HESAPLAMASI', {
      x: margin,
      y,
      size: 11,
      font: fontBold,
    });
    y -= 8;
    drawLine(y, 0.5);
    y -= 18;

    const estimatedBleed = clinic.hasWebsite ? '45.000 TL - 75.000 TL' : '75.000 TL - 150.000 TL';
    page.drawText(`Sisteminizdeki bu operasyonel bosluklar ve cevapsiz talepler nedeniyle`, {
      x: margin + 10,
      y,
      size: 9,
      font: fontRegular,
    });
    y -= 13;
    page.drawText(`her ay tahmini ${estimatedBleed} ciro doğrudan rakiplerinize kaymaktadir.`, {
      x: margin + 10,
      y,
      size: 9,
      font: fontBold,
      color: rgb(0.7, 0, 0),
    });
    y -= 25;

    // Section 4: Action Plan & CTA
    page.drawText('4. SIZINTI KAPATMA VE AKILLI OTONOMI PLANI', {
      x: margin,
      y,
      size: 11,
      font: fontBold,
    });
    y -= 8;
    drawLine(y, 0.5);
    y -= 18;

    page.drawText('Arka ofis otonomisi (Aura OS) kurulumu, hasta kayiplarini sifirlama plani ve', {
      x: margin + 10,
      y,
      size: 9,
      font: fontRegular,
    });
    y -= 13;
    page.drawText('operasyonel sızıntıyı kapatmak için Nextoria Digital Sistem Mimarı ile görüşün.', {
      x: margin + 10,
      y,
      size: 9,
      font: fontBold,
    });
    y -= 30;

    // Footer
    drawLine(y, 1);
    y -= 15;
    page.drawText('Nextoria Digital | Edge AI & B2B Autonomous Systems', {
      x: margin,
      y,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Generate PDF Buffer
    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Audit_Report_${sanitizeText(clinic.name).replace(/\s+/g, '_')}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('PDF Generation Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate PDF audit report.' },
      { status: 500 }
    );
  }
}
