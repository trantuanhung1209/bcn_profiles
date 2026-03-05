/**
 * Chuyển đổi chuỗi tiếng Việt có dấu sang không dấu
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  
  str = str.toLowerCase();
  
  // Bảng chuyển đổi
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  
  return str;
}

/**
 * So sánh 2 chuỗi có bỏ qua dấu tiếng Việt
 */
export function vietnameseIncludes(text: string, search: string): boolean {
  if (!text || !search) return false;
  
  const normalizedText = removeVietnameseTones(text);
  const normalizedSearch = removeVietnameseTones(search);
  
  return normalizedText.includes(normalizedSearch);
}
