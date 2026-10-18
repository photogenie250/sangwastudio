// Profile photo capture — placeholder until the storage bucket is wired up.
const btn = document.getElementById('student-avatar');
const toast = document.getElementById('dash-toast');
btn?.addEventListener('click', () => {
  if (!toast) return;
  toast.textContent = 'Guhindura ifoto biraza vuba.';
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 2500);
});
