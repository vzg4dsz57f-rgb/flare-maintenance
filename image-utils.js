/**
 * Flare Maintenance App — Client-side Image Compression (~1600px) & Attachment Reader
 */

window.FLARE_FILES = {
  MAX_DIMENSION: 1280,
  JPEG_QUALITY: 0.72,

  /**
   * Compresses an image File to max 1600px longest side JPEG base64.
   */
  compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid image file'));
        img.onload = () => {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          const maxDim = this.MAX_DIMENSION;

          if (w > maxDim || h > maxDim) {
            if (w >= h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          const dataUrl = canvas.toDataURL('image/jpeg', this.JPEG_QUALITY);
          const cleanName = (file.name || 'photo.jpg').replace(/\.[^.]+$/, '') + '.jpg';
          resolve({
            fileName: cleanName,
            mimeType: 'image/jpeg',
            base64Data: dataUrl,
            previewUrl: dataUrl
          });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  /**
   * Reads an attachment (image -> compressed ~1600px JPEG, PDF -> raw base64).
   */
  async readAttachment(file) {
    if (!file) return null;
    if (file.type && file.type.startsWith('image/')) {
      return this.compressImage(file);
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.onload = (e) => {
        resolve({
          fileName: file.name || 'attachment.pdf',
          mimeType: file.type || 'application/pdf',
          base64Data: e.target.result
        });
      };
      reader.readAsDataURL(file);
    });
  }
};
