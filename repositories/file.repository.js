const db = require('../infrastructure/database');

class FileRepository {
    /**
     * List files with filters and pagination
     */
    async findAll({ domain_id, mailbox_id, downloaded_year_month, uploaded_year_month, page = 1, limit = 20 }) {
        const conditions = ['f.is_soft_deleted = FALSE'];
        const params = [];

        if (domain_id) {
            conditions.push('m.domain_id = ?');
            params.push(parseInt(domain_id, 10));
        }

        if (mailbox_id) {
            conditions.push('f.mailbox_id = ?');
            params.push(parseInt(mailbox_id, 10));
        }

        if (downloaded_year_month) {
            conditions.push("DATE_FORMAT(f.downloaded_date_time, '%Y-%m') = ?");
            params.push(downloaded_year_month);
        }

        if (uploaded_year_month) {
            conditions.push("DATE_FORMAT(f.uploaded_date_time, '%Y-%m') = ?");
            params.push(uploaded_year_month);
        }

        const whereClause = conditions.join(' AND ');

        // Stats query
        const [statsResult] = await db.execute(
            `SELECT
                COUNT(*) as total,
                SUM(CASE WHEN f.is_downloaded = 1 THEN 1 ELSE 0 END) as downloaded,
                SUM(CASE WHEN f.is_uploaded_to_destination = 1 THEN 1 ELSE 0 END) as uploaded,
                SUM(CASE WHEN f.is_uploaded_to_destination = 0 THEN 1 ELSE 0 END) as pending
             FROM files f
             JOIN mailboxes m ON m.id = f.mailbox_id
             WHERE ${whereClause}`,
            params
        );
        
        const stats = {
            total: parseInt(statsResult[0].total, 10) || 0,
            downloaded: parseInt(statsResult[0].downloaded, 10) || 0,
            uploaded: parseInt(statsResult[0].uploaded, 10) || 0,
            pending: parseInt(statsResult[0].pending, 10) || 0,
        };
        const total = stats.total;

        // Data query
        const offset = (page - 1) * limit;
        const [rows] = await db.execute(
            `SELECT
                f.id,
                f.original_name,
                f.displayed_name_local,
                f.is_downloaded,
                f.downloaded_date_time,
                f.is_uploaded_to_destination,
                f.upload_destination,
                f.uploaded_date_time,
                f.is_manually_uploaded,
                f.mailbox_id,
                f.is_soft_deleted,
                f.local_file_location,
                f.created_at,
                f.updated_at,
                m.name AS mailbox_name,
                m.email AS mailbox_email
             FROM files f
             JOIN mailboxes m ON m.id = f.mailbox_id
             WHERE ${whereClause}
             ORDER BY f.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit, 10), offset]
        );

        return {
            data: rows,
            stats,
            pagination: {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findById(id) {
        const [rows] = await db.execute(
            `SELECT
                f.*,
                m.name AS mailbox_name,
                m.email AS mailbox_email,
                d.name AS domain_name
             FROM files f
             JOIN mailboxes m ON m.id = f.mailbox_id
             JOIN domains d ON d.id = m.domain_id
             WHERE f.id = ? AND f.is_soft_deleted = FALSE`,
            [id]
        );
        return rows[0] || null;
    }

    async markAsUploaded(id, destination) {
        const [result] = await db.execute(
            `UPDATE files
             SET is_uploaded_to_destination = TRUE,
                 upload_destination = ?,
                 uploaded_date_time = NOW(),
                 updated_at = NOW()
             WHERE id = ? AND is_soft_deleted = FALSE`,
            [destination, id]
        );
        return result.affectedRows > 0;
    }
}

module.exports = new FileRepository();
