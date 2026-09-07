// ============================================================
// SDMS — Student profile photo (parent/student portal)
//
// Tap the hero avatar → phone camera opens directly → point it at
// the student and take the photo → it's automatically center-cropped
// to a square, compressed, and uploaded. No extra steps in between —
// whatever the camera captures is what gets saved.
//
// Backend: supabase/migrations/0008_student_photos.sql — a
// `student-photos` storage bucket plus two RPCs
// (parent_portal_photo / parent_portal_update_photo). That
// migration must be run against the project before this will work;
// until then, saving will fail with a clear error toast rather than
// silently doing nothing.
//
// Deliberately separate from parent-dashboard.js (which owns the
// read-only lookup data) and dashboard-ui.js (pure UI chrome) —
// this file owns the one place the portal actually writes anything.
// ============================================================
import { supabase } from './supabase-client.js';

const CODE_KEY = 'sdms_parent_student_code';

// Output image: a square JPEG, shrunk/re-compressed until it's
// under this size. 512px at typical JPEG compression for a face
// photo comfortably clears this without looking soft.
const OUTPUT_SIZE = 512;
const MAX_BYTES = 220 * 1024; // 220KB

const heroAvatarBtn = document.getElementById('student-avatar');
const heroAvatarImg = document.getElementById('student-avatar-img');
const heroAvatarInitials = document.getElementById('student-avatar-initials');
const topbarAvatarImg = document.getElementById('topbar-avatar-img');
const topbarAvatarInitials = document.getElementById('topbar-avatar');

const cameraInput = document.getElementById('photo-camera-input');
const toastEl = document.getElementById('dash-toast');

if (heroAvatarBtn && cameraInput) {
  function studentCode() {
    return sessionStorage.getItem(CODE_KEY);
  }

  let toastTimer = null;
  function showToast(message) {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  function setAvatarImage(url) {
    if (!url) return;
    // Cache-bust so a re-taken photo (same filename, upsert) shows
    // up immediately instead of the browser serving its old copy.
    const bustUrl = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
    [
      [heroAvatarImg, heroAvatarInitials],
      [topbarAvatarImg, topbarAvatarInitials],
    ].forEach(([img, initials]) => {
      if (!img) return;
      img.src = bustUrl;
      img.hidden = false;
      if (initials) initials.style.visibility = 'hidden';
    });
  }

  function setUploading(isUploading) {
    heroAvatarBtn.classList.toggle('hero-avatar--uploading', isUploading);
  }

  // Whether this student's class currently allows photo upload —
  // set by an administrator on the Classes page, off by default.
  // Checked again server-side on save either way; this just keeps
  // the button from inviting a tap that would only fail.
  let uploadEnabled = true;

  // Load any existing photo on page open — this RPC is read-only
  // and student_number-scoped, same pattern as parent_portal_likes.
  async function loadExistingPhoto() {
    const code = studentCode();
    if (!code) return;
    const { data, error } = await supabase.rpc('parent_portal_photo', { p_student_number: code });
    if (error) {
      console.error('parent_portal_photo failed:', error.message);
      return;
    }
    if (data?.found && data.photo_url) {
      setAvatarImage(data.photo_url);
    }
    uploadEnabled = data?.upload_enabled !== false;
    if (!uploadEnabled) {
      heroAvatarBtn.classList.add('hero-avatar--disabled');
      heroAvatarBtn.setAttribute('aria-disabled', 'true');
    }
  }

  // Tapping the avatar opens the camera directly — no picker, no
  // extra taps. capture="environment" on the input (see dashboard/
  // index.html) points a phone's rear camera by default, since the
  // person holding the phone is photographing the student.
  heroAvatarBtn.addEventListener('click', () => {
    if (!uploadEnabled) {
      showToast('Baza DoD.');
      return;
    }
    cameraInput.click();
  });

  // ------------------------------------------------------------
  // Load the captured/selected file, auto center-crop it to a
  // square (the middle of whichever dimension is longer), and hand
  // off to the canvas for compression.
  // ------------------------------------------------------------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function centerCropToBlob(img, outputSize, quality) {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const srcX = (img.naturalWidth - side) / 2;
    const srcY = (img.naturalHeight - side) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, srcX, srcY, side, side, 0, 0, outputSize, outputSize);

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  // Try progressively harder compression (lower quality, then
  // smaller dimensions) until the file is comfortably small — this
  // is the actual "compressed to reduce space usage" step.
  async function compressToLimit(img) {
    const attempts = [
      [OUTPUT_SIZE, 0.85],
      [OUTPUT_SIZE, 0.7],
      [OUTPUT_SIZE, 0.55],
      [OUTPUT_SIZE, 0.4],
      [360, 0.6],
      [360, 0.4],
    ];
    let last = null;
    for (const [size, quality] of attempts) {
      const blob = await centerCropToBlob(img, size, quality);
      last = blob;
      if (blob && blob.size <= MAX_BYTES) return blob;
    }
    return last; // smallest we managed, even if still over the target
  }

  // ------------------------------------------------------------
  // File selected → auto-crop → compress → upload → save → done.
  // No confirmation step, matching the "point and it just uploads"
  // request — if the shot's no good, tapping the avatar again
  // simply overwrites it with a new one.
  // ------------------------------------------------------------
  async function handleFile(file) {
    if (!file) return;
    if (!uploadEnabled) {
      showToast('Baza DoD.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      showToast('Iyo dosiye si ifoto.');
      return;
    }

    const code = studentCode();
    if (!code) {
      showToast('Ntibyashobotse kubona kode y\'umunyeshuri. Ongera winjire.');
      return;
    }

    setUploading(true);
    try {
      const img = await loadImage(file);
      const blob = await compressToLimit(img);
      if (!blob) {
        showToast('Ntibyashobotse gutunganya iyo foto. Ongera ugerageze.');
        return;
      }

      const path = `${code.toLowerCase()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('student-photos')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) {
        console.error('Photo upload failed:', uploadError.message);
        showToast('Ntibyashobotse kohereza ifoto. Genzura interineti hanyuma ugerageze.');
        return;
      }

      const { data: publicUrlData } = supabase.storage.from('student-photos').getPublicUrl(path);
      const photoUrl = publicUrlData?.publicUrl;

      const { data: rpcData, error: rpcError } = await supabase.rpc('parent_portal_update_photo', {
        p_student_number: code,
        p_photo_url: photoUrl,
      });

      if (rpcError || !rpcData?.found) {
        console.error('parent_portal_update_photo failed:', rpcError?.message);
        showToast('Ifoto yoherejwe ariko ntibyashobotse kuyishyira ku mwirondoro.');
        return;
      }

      if (rpcData.upload_enabled === false) {
        uploadEnabled = false;
        heroAvatarBtn.classList.add('hero-avatar--disabled');
        heroAvatarBtn.setAttribute('aria-disabled', 'true');
        showToast('Baza DoD.');
        return;
      }

      setAvatarImage(rpcData.photo_url || photoUrl);
      showToast('Ifoto y\'umwirondoro yabitswe.');
    } catch (err) {
      console.error('Photo save failed:', err);
      showToast('Habaye ikibazo. Ongera ugerageze.');
    } finally {
      setUploading(false);
      cameraInput.value = '';
    }
  }

  cameraInput.addEventListener('change', (e) => handleFile(e.target.files?.[0]));

  loadExistingPhoto();
}
