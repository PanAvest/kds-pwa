import { useEffect } from 'react';
import { isNative } from '@/lib/nativePlatform';
import { downloadPdfUrlNative } from '@/lib/nativePdf';

const EbookPage = ({ slug }) => {
  const handleDownloadEbook = async () => {
    const url = `https://your-secure-api.com/ebooks/${slug}.pdf`; // Replace with your actual URL
    const filename = `${slug}.pdf`;
    const title = 'Download Ebook';
    const text = 'Check out this ebook!';

    if (isNative()) {
      await downloadPdfUrlNative({ url, filename, title, text });
    } else {
      window.open(url, '_blank');
    }
  };

  useEffect(() => {
    // Any additional logic for the ebook page can go here
  }, []);

  return (
    <div>
      <h1>Ebook: {slug}</h1>
      <button onClick={handleDownloadEbook}>Download Ebook</button>
    </div>
  );
};

export default EbookPage;