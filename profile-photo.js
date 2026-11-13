// Shared header photo. Existing session/access controls remain authoritative;
// this module never accepts a target user ID from the form.
(function () {
    const photoPattern = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
    const setupMessage = 'Profile photos need the Supabase update 20261113180000_profile_photo.sql.';
    window.RvrgProfilePhoto = {
        owner: null, current: null, pending: undefined, busy: false, loadError: '',
        valid(value) { return value == null || (typeof value === 'string' && value.length <= 100000 && photoPattern.test(value)); },
        styles() {
            if (document.getElementById('profilePhotoStyles')) return;
            const style = document.createElement('style');
            style.textContent = `.profile-photo-button{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #ffffff70;border-radius:50%;padding:0;background:transparent;color:inherit;flex-shrink:0;cursor:pointer}.profile-photo-button img{width:32px;height:32px;object-fit:cover;border-radius:50%}.profile-photo-button [hidden],#profilePhotoDialog [hidden]{display:none!important}#profilePhotoDialog{position:fixed;inset:0;margin:auto;max-height:calc(100dvh - 24px);overflow:auto;width:360px;max-width:calc(100vw - 24px);border:0;border-radius:12px;padding:24px;box-shadow:0 12px 50px #0005;z-index:10000}#profilePhotoDialog::backdrop{background:#001f24aa}.profile-photo-preview{height:128px;width:128px;object-fit:cover;border-radius:50%;margin:12px auto;display:block}.profile-photo-empty{font-size:90px;text-align:center;color:#647882;margin:12px auto}`;
            style.id = 'profilePhotoStyles';
            document.head.appendChild(style);
        },
        message(text) {
            const label = document.getElementById('profilePhotoMessage');
            if (label) label.textContent = text;
        },
        picture(id, fallbackId, value) {
            const img = document.getElementById(id), fallback = document.getElementById(fallbackId);
            if (!img || !fallback) return;
            const valid = Boolean(value && this.valid(value));
            img.hidden = !valid; fallback.hidden = valid;
            if (valid) img.src = value; else img.removeAttribute('src');
        },
        preview(value) { this.picture('profilePhotoPreview', 'profilePhotoPreviewFallback', value); },
        header() { this.picture('headerProfilePhoto', 'headerProfilePhotoFallback', this.current); },
        async attach() {
            this.styles();
            const user = getCurrentUser();
            if (!user) return;
            const button = document.getElementById('profilePhotoButton');
            if (button) button.onclick = () => this.open();
            if (this.owner !== String(user.id)) {
                this.owner = String(user.id); this.current = null; this.pending = undefined; this.loadError = '';
            }
            this.header();
            const owner = this.owner;
            try {
                const {data,error} = await window.supabaseClient.from('users_master').select('profile_photo').eq('id', user.id).single();
                if (error) throw error;
                if (owner !== String(getCurrentUser()?.id) || owner !== this.owner) return;
                this.current = this.valid(data?.profile_photo) ? data?.profile_photo || null : null;
                this.loadError = ''; this.header();
            } catch (error) {
                if (owner === this.owner) this.loadError = ['42703','PGRST204'].includes(error.code) ? setupMessage : 'Unable to load your photo. Please try again.';
            }
        },
        open() {
            this.styles();
            if (this.busy) return;
            const user = getCurrentUser();
            if (!user) return;
            if (String(user.id) !== this.owner) { this.owner = String(user.id); this.current = null; }
            let dialog = document.getElementById('profilePhotoDialog');
            if (!dialog) {
                dialog = document.createElement('dialog'); dialog.id = 'profilePhotoDialog';
                dialog.setAttribute('aria-labelledby','profilePhotoTitle');
                dialog.innerHTML = `<h5 id="profilePhotoTitle">Your profile photo</h5>
                    <p id="profilePhotoOwner" class="text-muted small"></p>
                    <img id="profilePhotoPreview" class="profile-photo-preview" alt="Selected profile photo" hidden>
                    <div id="profilePhotoPreviewFallback" class="profile-photo-empty" aria-label="No profile photo"><i class="fa-solid fa-circle-user" aria-hidden="true"></i></div>
                    <label for="profilePhotoFile" class="form-label">Choose photo</label>
                    <input id="profilePhotoFile" class="form-control" type="file" accept="image/jpeg,image/png,image/webp">
                    <p class="small text-muted mt-2">JPG, PNG or WebP, up to 5 MB. Saved as a small profile image.</p>
                    <p id="profilePhotoMessage" class="small" role="status" aria-live="polite"></p>
                    <div class="d-flex gap-2 justify-content-end">
                        <button id="profilePhotoRemove" class="btn btn-outline-danger btn-sm" type="button">Remove</button>
                        <button id="profilePhotoClose" class="btn btn-secondary btn-sm" type="button">Close</button>
                        <button id="profilePhotoSave" class="btn btn-success btn-sm" type="button" disabled>Save photo</button>
                    </div>`;
                document.body.appendChild(dialog);
                document.getElementById('profilePhotoClose').onclick = () => { if (!this.busy) dialog.close(); };
                document.getElementById('profilePhotoRemove').onclick = () => {
                    if (this.busy) return;
                    this.pending = null; this.preview(null); this.message('Click Save photo to remove your photo.');
                    document.getElementById('profilePhotoSave').disabled = false;
                };
                document.getElementById('profilePhotoSave').onclick = () => this.save();
                document.getElementById('profilePhotoFile').onchange = event => this.selectFile(event.target.files[0]);
                dialog.addEventListener('cancel', event => { if (this.busy) event.preventDefault(); });
            }
            this.pending = undefined;
            document.getElementById('profilePhotoOwner').textContent = user.name || 'Your account';
            document.getElementById('profilePhotoFile').value = '';
            document.getElementById('profilePhotoSave').disabled = true;
            this.preview(this.current); this.message(this.loadError);
            if (!dialog.open) dialog.showModal();
        },
        async compress(file) {
            if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
            if (file.size > 5 * 1024 * 1024) throw new Error('Choose a photo smaller than 5 MB.');
            const url = URL.createObjectURL(file);
            try {
                const image = await new Promise((resolve,reject) => {
                    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('This image could not be opened.')); img.src = url;
                });
                const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
                const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,256,256);
                const side = Math.min(image.naturalWidth,image.naturalHeight);
                ctx.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,256,256);
                let value = canvas.toDataURL('image/jpeg',0.82);
                if (value.length > 100000) value = canvas.toDataURL('image/jpeg',0.6);
                if (!this.valid(value)) throw new Error('This photo is too large after resizing. Choose a simpler image.');
                return value;
            } finally { URL.revokeObjectURL(url); }
        },
        async selectFile(file) {
            if (!file || this.busy) return;
            const owner = this.owner; this.busy = true;
            document.getElementById('profilePhotoSave').disabled = true;
            try {
                const value = await this.compress(file);
                if (owner !== String(getCurrentUser()?.id)) throw new Error('Your session changed. Reopen your profile.');
                this.pending = value; this.preview(value); this.message('Preview ready. Click Save photo.');
            } catch (error) { this.message(error.message); }
            finally { this.busy = false; document.getElementById('profilePhotoSave').disabled = this.pending === undefined; }
        },
        async save() {
            if (this.busy || this.pending === undefined) return;
            const user = getCurrentUser();
            if (!user || String(user.id) !== this.owner) { this.message('Your session changed. Reopen your profile.'); return; }
            if (!this.valid(this.pending)) { this.message('Please choose a valid photo.'); return; }
            this.busy = true; const value = this.pending; const owner = String(user.id);
            document.getElementById('profilePhotoSave').disabled = true;
            try {
                const {data,error} = await window.supabaseClient.from('users_master').update({profile_photo:value}).eq('id',user.id).select('id,profile_photo').single();
                if (error) throw error;
                if (String(data?.id) !== String(user.id) || data.profile_photo !== value) throw new Error('The saved photo could not be confirmed.');
                if (String(getCurrentUser()?.id) !== owner || this.owner !== owner) return;
                this.current = value; this.pending = undefined; this.loadError = ''; this.header(); this.message('Profile photo saved.');
            } catch (error) { this.message(['42703','PGRST204'].includes(error.code) ? setupMessage : error.message); }
            finally { this.busy = false; document.getElementById('profilePhotoSave').disabled = this.pending === undefined; }
        }
    };
})();
