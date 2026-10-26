const SUPABASE_URL = "https://zakzkcxyxntvlsvywmii.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpha3prY3h5eG50dmxzdnl3bWlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwODY1NDIsImV4cCI6MjA4NDY2MjU0Mn0.hApvnHyFsm5SBPUWdJ0AHrjMmxYrihXhEq9P_Knp-vY";

const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = "ee-resources";

document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("uploadModal");
    const openBtn = document.getElementById("openUploadBtn");
    const closeBtn = document.getElementById("closeUploadBtn");
    const fileInput = document.getElementById("fileInput");
    const subjectInput = document.getElementById("subjectInput");
    const progressContainer = document.getElementById("progressContainer");
    const pageCopy = () => window.eeHomepageCopy?.[document.documentElement.lang] || window.eeHomepageCopy?.ar || { requiredCourse: 'الرجاء إدخال اسم المادة', uploading: 'جارٍ الرفع', filesSelected: 'ملفات محددة' };
    let uploading = false;
    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'secondary-button hidden';
    progressContainer?.appendChild(retryButton);

    if (openBtn) {
        openBtn.addEventListener("click", () => {
            modal.classList.replace("hidden", "flex");
            modal.setAttribute("aria-hidden", "false");
            modal.inert = false;
            document.body.style.overflow = "hidden";
            subjectInput?.focus();
        });
    }
    
    
    // دالة موحدة لإغلاق المودال وإعادة ضبطه
    const closeModal = () => {
        if (uploading) return;
        retryButton.classList.add('hidden');
        modal.classList.replace("flex", "hidden");
        modal.setAttribute("aria-hidden", "true");
        modal.inert = true;
        document.body.style.overflow = "";
        openBtn?.focus();
        
        // إعادة تهيئة النموذج ليكون جاهزاً للرفع القادم
        setTimeout(() => {
            document.getElementById("formContent")?.classList.remove("hidden");
            document.getElementById("successUi")?.classList.add("hidden");
            document.getElementById("dropZone")?.classList.remove("hidden");
            document.getElementById("progressContainer")?.classList.add("hidden");
            if (fileInput) fileInput.value = ""; 
        }, 500);
    };

    // ربط الأكس (X) وزر الإغلاق بالدالة
    document.querySelectorAll("#closeUploadBtn, #closeSuccessBtn").forEach(btn => {
        btn.addEventListener("click", closeModal);
    });

    modal?.addEventListener("click", (event) => {
        if (event.target === modal) closeModal();
    });

    modal?.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeModal();
            return;
        }
        if (event.key !== "Tab") return;
        const controls = Array.from(modal.querySelectorAll("button:not([disabled]), input:not([disabled])"))
            .filter(control => !control.closest(".hidden"));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    });

    async function uploadFiles(files, subject, noteValue) {
        if (uploading) return;
        uploading = true;
        if (fileInput) fileInput.disabled = true;
        if (subjectInput) subjectInput.disabled = true;
        const noteField = document.getElementById("noteInput");
        if (noteField) noteField.disabled = true;
        const closeButtons = document.querySelectorAll('#closeUploadBtn, #closeSuccessBtn');
        closeButtons.forEach(button => { button.disabled = true; });
        const strings = pageCopy();
        const arabic = document.documentElement.lang === 'ar';
        retryButton.classList.add('hidden');
        document.getElementById("dropZone")?.classList.add("hidden");
        progressContainer?.classList.remove("hidden");
        document.getElementById("fileCountText").textContent = `${files.length} ${strings.filesSelected || (arabic ? "ملفات محددة" : "files selected")}`;
        document.getElementById("progressText").textContent = strings.uploading;
        document.getElementById("progressBar").style.width = '0%';
        document.getElementById("progressPercent").textContent = '0%';
        let finished = 0;
        const failed = [];
        try {
            // One request sequence at a time bounds memory and avoids runaway uploads.
            for (const file of files) {
                try {
                    const fileExt = file.name.includes('.') ? file.name.split('.').pop() : '';
                    const safeName = `${crypto.randomUUID()}${fileExt ? '.' + fileExt.replace(/[^a-zA-Z0-9]/g, '') : ''}`;
                    const path = `pending/${safeName}`;
                    const { error: upErr } = await supa.storage.from(BUCKET).upload(path, file);
                    if (upErr) throw upErr;
                    const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(path);
                    const { error: insErr } = await supa.from("resources").insert([{
                        subject, file_url: pub.publicUrl, file_path: path,
                        file_type: fileExt, status: "pending", note: noteValue
                    }]);
                    if (insErr) {
                        const { error: cleanupError } = await supa.storage.from(BUCKET).remove([path]);
                        if (cleanupError) console.warn('Upload cleanup failed.', cleanupError);
                        throw insErr;
                    }
                } catch (error) {
                    failed.push(file);
                    console.warn('Resource upload failed.', error);
                }
                finished++;
                const percent = Math.round(finished / files.length * 100);
                document.getElementById("progressBar").style.width = `${percent}%`;
                document.getElementById("progressPercent").textContent = `${percent}%`;
            }
            if (failed.length) {
                document.getElementById("progressText").textContent = arabic
                    ? `تم رفع ${files.length - failed.length} من ${files.length}. تعذر رفع: ${failed.map(file => file.name).join('، ')}`
                    : `Uploaded ${files.length - failed.length} of ${files.length}. Failed: ${failed.map(file => file.name).join(', ')}`;
                retryButton.textContent = arabic ? 'إعادة محاولة الملفات المتعثرة' : 'Retry failed files';
                retryButton.classList.remove('hidden');
                retryButton.onclick = () => uploadFiles(failed, subject, noteValue);
            } else {
                document.getElementById("formContent").classList.add("hidden");
                document.getElementById("successUi").classList.remove("hidden");
                if (noteField) noteField.value = "";
                if (subjectInput) subjectInput.value = "";

            }
        } finally {
            uploading = false;
            if (fileInput) fileInput.disabled = false;
            if (fileInput) fileInput.value = '';
            if (subjectInput) subjectInput.disabled = false;
            if (noteField) noteField.disabled = false;
            closeButtons.forEach(button => { button.disabled = false; });
            if (!failed.length) document.getElementById('closeSuccessBtn')?.focus();
        }
    }

    fileInput?.addEventListener("change", () => {
        const files = Array.from(fileInput.files);
        if (!files.length || uploading) return;
        const subject = subjectInput?.value.trim();
        if (!subject) {
            alert(pageCopy().requiredCourse);
            fileInput.value = '';
            subjectInput?.focus();
            return;
        }
        const note = document.getElementById('noteInput')?.value.trim() || '';
        uploadFiles(files, subject, note);
    });
});
