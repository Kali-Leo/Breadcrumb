// Purpose: the one conversion between how a page arrives and how the OCR models want it.
// The webview hands over what a canvas holds — RGBA, row-major, eight bits a channel — and
// the models take RGB. Kept apart from ocr.rs so the pixel arithmetic has tests of its own
// and the command file stays about the models.

use image::RgbImage;

/// Drops the alpha channel. The page was rendered onto an opaque white canvas, so alpha is
/// 255 throughout and carries nothing; a length that is not width × height × 4 means the
/// caller and this side disagree about the image and nothing here can guess which is right.
pub fn rgba_to_rgb(rgba: &[u8], width: u32, height: u32) -> Result<RgbImage, String> {
    let pixels = (width as usize)
        .checked_mul(height as usize)
        .ok_or("page too large")?;
    if rgba.len() != pixels * 4 {
        return Err(format!(
            "expected {} bytes of RGBA for {width}x{height}, got {}",
            pixels * 4,
            rgba.len()
        ));
    }
    let mut rgb = Vec::with_capacity(pixels * 3);
    for pixel in rgba.chunks_exact(4) {
        rgb.extend_from_slice(&pixel[..3]);
    }
    RgbImage::from_raw(width, height, rgb).ok_or_else(|| "page buffer did not fit".to_string())
}

#[cfg(test)]
mod tests {
    use super::rgba_to_rgb;

    #[test]
    fn alpha_is_dropped_and_the_pixels_keep_their_places() {
        let rgba = [1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255];
        let rgb = rgba_to_rgb(&rgba, 2, 2).expect("converts");
        assert_eq!(rgb.get_pixel(0, 0).0, [1, 2, 3]);
        assert_eq!(rgb.get_pixel(1, 0).0, [4, 5, 6]);
        assert_eq!(rgb.get_pixel(0, 1).0, [7, 8, 9]);
        assert_eq!(rgb.get_pixel(1, 1).0, [10, 11, 12]);
    }

    #[test]
    fn a_buffer_of_the_wrong_length_is_refused_rather_than_guessed_at() {
        assert!(rgba_to_rgb(&[0; 15], 2, 2).is_err());
        assert!(rgba_to_rgb(&[0; 16], 2, 3).is_err());
        assert!(rgba_to_rgb(&[], 0, 0).is_ok_and(|image| image.width() == 0));
    }
}
