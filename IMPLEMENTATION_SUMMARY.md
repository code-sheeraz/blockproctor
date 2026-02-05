# Admin-Verification Workflow Implementation Summary

## ✅ Completed Implementation

### 1. Database Schema Updates
**File:** `backend/migrations/001_add_enrollment_workflow.sql`

- Added `enrollment_status` enum: `NOT_ENROLLED`, `PENDING`, `APPROVED`, `REJECTED`
- Added `profile_photo_url` column to `users` table
- Created `exam_sessions` table with status tracking
- Added indexes for performance
- Migrated existing data

**To apply:** Run the SQL migration script against your PostgreSQL database.

### 2. Backend Routes

#### Enrollment Route (`backend/routes/enrollRoutes.js`)
- `POST /api/enroll/upload` - Student uploads face photo + descriptor, sets status to PENDING

#### Admin Routes (`backend/routes/adminRoutes.js`)
- `GET /api/admin/pending-enrollments` - Get all pending enrollments
- `POST /api/admin/approve/:userId` - Approve enrollment
- `POST /api/admin/reject/:userId` - Reject enrollment (clears face data)
- `GET /api/admin/submitted-exams` - Get all submitted exam sessions
- `POST /api/admin/reset-exam/:sessionId` - Reset exam to allow re-attempt

#### Updated User Routes (`backend/routes/userRoutes.js`)
- `GET /api/users/:userId/enrollment-status` - Get enrollment status

#### Updated Exam Routes (`backend/routes/examRoutes.js`)
- Updated exam submission to create `exam_sessions` records

### 3. Frontend Components

#### Updated EnrollFace.jsx
- Now captures both photo (Base64) and face descriptor
- Sends to `/api/enroll/upload` endpoint
- Sets status to PENDING
- Shows "Waiting for Admin Approval" message

#### Updated StudentDashboard.jsx
- Checks enrollment status before allowing exam start
- Button states:
  - **APPROVED**: "Start Attempt →" (enabled)
  - **PENDING**: "⏳ Pending Approval" (disabled)
  - **REJECTED**: "❌ Photo Rejected" (disabled) + re-enroll button
  - **NOT_ENROLLED**: "Enroll Face First →" (redirects to enrollment)

#### Updated ExamVerification.jsx
- Checks enrollment status before allowing verification
- Redirects based on status:
  - PENDING → Dashboard with message
  - REJECTED → Enrollment page
  - NOT_ENROLLED → Enrollment page

#### New AdminDashboard.jsx
- **Enrollments Tab**: Shows pending enrollments with photos
  - Approve/Reject buttons
  - Shows student name, email, submission date
- **Submitted Exams Tab**: Shows all submitted exam sessions
  - "Allow Re-attempt" button to reset exams
  - Shows student info, exam title, submission date

### 4. Server Configuration
**File:** `backend/server.js`
- Registered new routes: `/api/enroll`, `/api/admin`

## 🔧 Setup Instructions

### 1. Run Database Migration
```bash
psql -U postgres -d blockproctor -f backend/migrations/001_add_enrollment_workflow.sql
```

### 2. Update Existing Users (Optional)
If you have existing users with face descriptors, they will be auto-set to APPROVED by the migration.

### 3. Access Admin Dashboard
Navigate to: `http://localhost:5173/admin` (or your frontend URL)

## 📋 Workflow Flow

### Student Enrollment Flow:
1. Student navigates to `/enroll-face/:userId`
2. Captures face photo via webcam
3. System generates face descriptor (client-side)
4. Both photo + descriptor sent to `/api/enroll/upload`
5. Status set to `PENDING`
6. Student sees "Waiting for Admin Approval"

### Admin Approval Flow:
1. Admin navigates to `/admin`
2. Sees pending enrollments in "Pending Enrollments" tab
3. Reviews student photo
4. Clicks "Approve" or "Reject"
5. If approved: Student can now start exams
6. If rejected: Student must re-enroll

### Exam Start Flow:
1. Student navigates to dashboard
2. System checks `enrollment_status`
3. If `APPROVED`: "Start Attempt" button enabled
4. If `PENDING`: Button disabled, shows "Pending Approval"
5. If `REJECTED`: Button disabled, shows "Photo Rejected"
6. If `NOT_ENROLLED`: Button redirects to enrollment

### Exam Reset Flow:
1. Admin navigates to `/admin` → "Submitted Exams" tab
2. Sees list of submitted exams
3. Clicks "Allow Re-attempt" for a session
4. System deletes exam_session and related attempt
5. Student can now start the exam again

## 🔒 Security Notes

1. **Admin Authentication**: Currently, admin routes have a placeholder `isAdmin` middleware. **You must implement proper admin authentication** before production use.

2. **One Session Per Exam**: The `exam_sessions` table has a UNIQUE constraint on `(exam_id, student_id)` to prevent multiple sessions.

3. **Status Validation**: All exam start operations check enrollment status server-side (should be added to backend routes).

## 🐛 Known Issues / TODO

1. Add server-side enrollment status check in exam start endpoint
2. Implement proper admin authentication middleware
3. Add exam session creation when student starts exam (not just on submission)
4. Add email notifications for approval/rejection (optional)
5. Add audit logging for admin actions (optional)

## 📝 API Endpoints Summary

### Student Endpoints:
- `POST /api/enroll/upload` - Upload face enrollment
- `GET /api/users/:userId/enrollment-status` - Check status

### Admin Endpoints:
- `GET /api/admin/pending-enrollments` - List pending enrollments
- `POST /api/admin/approve/:userId` - Approve enrollment
- `POST /api/admin/reject/:userId` - Reject enrollment
- `GET /api/admin/submitted-exams` - List submitted exams
- `POST /api/admin/reset-exam/:sessionId` - Reset exam session

## 🎯 Testing Checklist

- [ ] Run database migration successfully
- [ ] Student can enroll face (status → PENDING)
- [ ] Admin can see pending enrollments
- [ ] Admin can approve enrollment (status → APPROVED)
- [ ] Admin can reject enrollment (status → REJECTED)
- [ ] Student dashboard shows correct button state based on status
- [ ] Exam start is blocked if not APPROVED
- [ ] Exam submission creates exam_sessions record
- [ ] Admin can see submitted exams
- [ ] Admin can reset exam to allow re-attempt
