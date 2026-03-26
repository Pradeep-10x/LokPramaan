/**
 * JanPramaan — Comment Controller
 */
import { Request, Response, NextFunction } from 'express';
import * as commentService from '../services/comment.service';

/** POST /api/issues/:issueId/comments */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const issueId = req.params.issueId as string;
    const { body } = req.body;

    if (!body || typeof body !== 'string' || !body.trim()) {
      res.status(400).json({ error: 'BODY_REQUIRED', message: 'Comment body is required' });
      return;
    }

    const comment = await commentService.createComment(issueId, req.user!.id, body.trim());
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
}

/** GET /api/issues/:issueId/comments?page=1&limit=20 */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const issueId = req.params.issueId as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await commentService.listComments(issueId, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/issues/:issueId/comments/:commentId */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await commentService.deleteComment(
      req.params.commentId as string,
      req.user!.id,
      req.user!.role,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** GET /api/issues/:issueId/comments/mentionable */
export async function mentionable(req: Request, res: Response, next: NextFunction) {
  try {
    const users = await commentService.getMentionableUsers(req.params.issueId as string);
    res.json({ users });
  } catch (err) {
    next(err);
  }
}
