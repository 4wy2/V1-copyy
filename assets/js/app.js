const SUPABASE_URL = "https://zakzkcxyxntvlsvywmii.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpha3prY3h5eG50dmxzdnl3bWlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwODY1NDIsImV4cCI6MjA4NDY2MjU0Mn0.hApvnHyFsm5SBPUWdJ0AHrjMmxYrihXhEq9P_Knp-vY";

const BUCKET = "ee-resources";

// Load the upload dependency only when needed; navigation works if its CDN is unavailable.
let uploadClient;
let sdkPromise;
function getUploadClient() {
    if (uploadClient) return Promise.resolve(uploadClient);
    if (!sdkPromise) {
        sdkPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const timeout = setTimeout(() => fail(new Error('Upload service timed out')), 15000);
            function fail(error) {
                clearTimeout(timeout);
                script.remove();
                sdkPromise = undefined;
                reject(error);
            }
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.async = true;
            script.onerror = () => fail(new Error('Upload service could not be loaded'));
            script.onload = () => {
                clearTimeout(timeout);
                try {
                    uploadClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                    resolve(uploadClient);
                } catch (error) { fail(error); }
            };
            document.head.appendChild(script);
        });
    }
    return sdkPromise;
}

(() => {
    const modal = document.getElementById('uploadModal');
    const openButton = document.getElementById('openUploadBtn');
    const fileInput = document.getElementById('fileInput');
    const subjectInput = document.getElementById('subjectInput');
    const noteInput = document.getElementById('noteInput');
    const progressContainer = document.getElementById('progressContainer');
    const progressText = document.getElementById('progressText');
    const progress = document.getElementById('uploadProgress');
    const formContent = document.getElementById('formContent');
    const successUi = document.getElementById('successUi');
    const copy = () => window.eeHomepageCopy[document.documentElement.lang] || window.eeHomepageCopy.ar;
    let uploading = false;
    let succeeded = false;
    let result = null;
    let retry = null;

    const retryButton = document.createElement('button');
    retryButton.id = 'retryUploadBtn';
    retryButton.type = 'button';
    retryButton.className = 'secondary-button hidden';
    retryButton.addEventListener('click', () => { if (retry) uploadFiles(...retry); });
    progressContainer.appendChild(retryButton);
    const backgroundNotice = document.createElement('p');
    backgroundNotice.className = 'upload-background hidden';
    progressContainer.appendChild(backgroundNotice);

    function isOpen() { return !modal.classList.contains('hidden'); }
    function setBackgroundInert(inert) {
        document.querySelectorAll('header, main, footer, .skip-link').forEach(element => { element.inert = inert; });
    }
    function renderStatus() {
        const strings = copy();
        retryButton.textContent = strings.retryUpload;
        backgroundNotice.textContent = strings.uploadBackground;
        backgroundNotice.classList.toggle('hidden', !uploading);
        if (uploading) progressText.textContent = strings.uploading;
        else if (result) {
            const summary = `${strings.uploadSummary} ${result.total - result.failed.length} ${strings.of} ${result.total}.`;
            progressText.textContent = result.unavailable ? strings.uploadUnavailable
                : `${summary} ${strings.uploadFailed} ${result.failed.map(file => file.name).join(document.documentElement.lang === 'ar' ? '، ' : ', ')}`;
        }
        if (result) document.getElementById('fileCountText').textContent = `${result.total} ${strings.filesSelected}`;
    }
    function resetForm() {
        formContent.classList.remove('hidden');
        successUi.classList.add('hidden');
        document.getElementById('dropZone').classList.remove('hidden');
        progressContainer.classList.add('hidden');
        retryButton.classList.add('hidden');
        modal.setAttribute('aria-labelledby', 'uploadTitle');
        result = null;
        retry = null;
        succeeded = false;
    }
    openButton.addEventListener('click', () => {
        if (succeeded) resetForm();
        modal.classList.replace('hidden', 'flex');
        modal.setAttribute('aria-hidden', 'false');
        modal.inert = false;
        document.body.classList.add('modal-open');
        setBackgroundInert(true);
        (uploading ? document.getElementById('closeUploadBtn') : retry ? retryButton : subjectInput).focus();
    });
    function closeModal() {
        modal.classList.replace('flex', 'hidden');
        modal.setAttribute('aria-hidden', 'true');
        modal.inert = true;
        document.body.classList.remove('modal-open');
        setBackgroundInert(false);
        openButton.focus();
    }
    document.querySelectorAll('#closeUploadBtn, #closeSuccessBtn').forEach(button => button.addEventListener('click', closeModal));
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
        if (event.key !== 'Tab') return;
        const controls = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]')]
            .filter(control => control.getClientRects().length && !control.closest('[inert]'));
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    document.getElementById('eeSourceForm').addEventListener('submit', event => event.preventDefault());
    document.addEventListener('ee:languagechange', renderStatus);
    function warnBeforeUnload(event) { event.preventDefault(); event.returnValue = ''; }
    subjectInput.addEventListener('input', () => subjectInput.setCustomValidity(''));

    async function uploadFiles(files, subject, note) {
        if (uploading || !files.length) return;
        uploading = true;
        window.addEventListener('beforeunload', warnBeforeUnload);
        result = { total: files.length, failed: [], unavailable: false };
        retryButton.classList.add('hidden');
        [fileInput, subjectInput, noteInput].forEach(input => { input.disabled = true; });
        document.getElementById('dropZone').classList.add('hidden');
        progressContainer.classList.remove('hidden');
        setProgress(0);
        renderStatus();
        if (isOpen()) document.getElementById('closeUploadBtn').focus();
        try {
            let client;
            try { client = await getUploadClient(); }
            catch (error) {
                result.unavailable = true;
                result.failed = [...files];
                console.warn('Upload service unavailable.', error);
                return;
            }
            // Sequential uploads bound resource use and allow retries of failed files only.
            for (const [index, file] of files.entries()) {
                try {
                    const extension = file.name.includes('.') ? file.name.split('.').pop() : '';
                    const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, '');
                    const identifier = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    const path = `pending/${identifier}${safeExtension ? '.' + safeExtension : ''}`;
                    const { error: uploadError } = await client.storage.from(BUCKET).upload(path, file);
                    if (uploadError) throw uploadError;
                    const { data: publicFile } = client.storage.from(BUCKET).getPublicUrl(path);
                    const { error: insertError } = await client.from('resources').insert([{
                        subject, file_url: publicFile.publicUrl, file_path: path,
                        file_type: extension, status: 'pending', note
                    }]);
                    if (insertError) {
                        const { error: cleanupError } = await client.storage.from(BUCKET).remove([path]);
                        if (cleanupError) console.warn('Upload cleanup failed.', cleanupError);
                        throw insertError;
                    }
                } catch (error) {
                    result.failed.push(file);
                    console.warn('Resource upload failed.', error);
                }
                setProgress(Math.round((index + 1) / files.length * 100));
            }
            if (!result.failed.length) {
                succeeded = true;
                formContent.classList.add('hidden');
                successUi.classList.remove('hidden');
                modal.setAttribute('aria-labelledby', 'uploadSuccessTitle');
                subjectInput.value = '';
                noteInput.value = '';
                if (isOpen()) document.getElementById('uploadSuccessTitle').focus();
            }
        } finally {
            uploading = false;
            window.removeEventListener('beforeunload', warnBeforeUnload);
            [fileInput, subjectInput, noteInput].forEach(input => { input.disabled = false; });
            fileInput.value = '';
            if (result.failed.length) {
                retry = [result.failed, subject, note];
                retryButton.classList.remove('hidden');
                if (isOpen()) retryButton.focus();
            } else retry = null;
            renderStatus();
        }
    }
    function setProgress(percent) {
        document.getElementById('progressBar').style.width = `${percent}%`;
        document.getElementById('progressPercent').textContent = `${percent}%`;
        progress.setAttribute('aria-valuenow', String(percent));
    }
    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files);
        if (!files.length || uploading) return;
        const subject = subjectInput.value.trim();
        if (!subject) {
            fileInput.value = '';
            subjectInput.setCustomValidity(copy().requiredCourse);
            subjectInput.reportValidity();
            subjectInput.focus();
            return;
        }
        uploadFiles(files, subject, noteInput.value.trim());
    });
})();
