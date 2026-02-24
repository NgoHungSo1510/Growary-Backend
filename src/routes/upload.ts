import { Router, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload proof image (base64)
router.post('/proof', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { image } = req.body;

        if (!image) {
            res.status(400).json({ error: 'Image data is required' });
            return;
        }

        const result = await cloudinary.uploader.upload(image, {
            folder: 'growary/proofs',
            resource_type: 'image',
            transformation: [
                { width: 800, height: 800, crop: 'limit', quality: 'auto' },
            ],
        });

        res.json({ url: result.secure_url, publicId: result.public_id });
    } catch (error: any) {
        console.error('Upload failed:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

export default router;
