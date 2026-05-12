import { Router } from 'express';
import { 
    toggleBookmark, 
    getBookmarks, 
    addNote, 
    getNotes, 
    deleteNote 
} from '../controllers/interaction.controller.js';
import { isLoggedIn } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(isLoggedIn);

router.route('/bookmark').post(toggleBookmark);
router.route('/bookmark/:courseId').get(getBookmarks);

router.route('/note').post(addNote);
router.route('/note/:courseId').get(getNotes);
router.route('/note/:noteId').delete(deleteNote);

export default router;
