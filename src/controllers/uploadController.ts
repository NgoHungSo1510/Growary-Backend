import { Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { AuthRequest } from '../middleware/auth';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadProof = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { image } = req.body;
        if (!image) { res.status(400).json({ error: 'Image data is required' }); return; }

        const result = await cloudinary.uploader.upload(image, {
            folder: 'growary/proofs',
            resource_type: 'image',
            transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }],
        });

        res.json({ url: result.secure_url, publicId: result.public_id });
    } catch (error: any) {
        console.error('Upload failed:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
};

export const uploadImage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { image } = req.body;
        if (!image) { res.status(400).json({ error: 'Image data is required' }); return; }

        if (!process.env.CLOUDINARY_API_KEY) {
            // Safe fallback to Base64 data URL in development or when Cloudinary is not configured
            res.json({ url: image });
            return;
        }

        try {
            const result = await cloudinary.uploader.upload(image, {
                folder: 'growary/characters',
                resource_type: 'image',
                transformation: [{ width: 400, height: 400, crop: 'limit', quality: 'auto' }],
            });
            res.json({ url: result.secure_url });
        } catch (cloudErr) {
            console.warn('Cloudinary upload failed, falling back to data URL:', cloudErr);
            res.json({ url: image });
        }
    } catch (error: any) {
        console.error('Upload failed:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
};
