import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const ref = (to, extra = {}) => ({ type: Schema.Types.ObjectId, ref: to, ...extra });
const opts = { timestamps: true };

export const Counter = model('Counter', new Schema({ _id: String, seq: { type: Number, default: 0 } }));
export async function nextCode(prefix) {
  const c = await Counter.findByIdAndUpdate(prefix, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `${prefix}-${String(c.seq).padStart(4, '0')}`;
}

export const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'staff', 'trainer', 'member'], required: true, index: true },
  isActive: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
  memberId: ref('Member'), trainerId: ref('Trainer'),
  isDemo: { type: Boolean, default: false },
  lastLoginAt: Date,
}, opts));

export const Trainer = model('Trainer', new Schema({
  trainerCode: { type: String, unique: true },
  user: ref('User', { required: true }),
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true },
  photoUrl: String,
  specialization: { type: String, default: 'General fitness' },
  experienceYears: { type: Number, min: 0, max: 60, default: 0 },
  certifications: [String], // listed as declared; verification is a manual admin process
  availability: [{ day: { type: Number, min: 0, max: 6 }, from: String, to: String }],
  employmentStatus: { type: String, enum: ['active', 'inactive'], default: 'active' },
  isDemo: { type: Boolean, default: false },
}, opts));

export const Member = model('Member', new Schema({
  memberCode: { type: String, unique: true },
  user: ref('User', { required: true, unique: true }),
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true },
  phone: { type: String, required: true, unique: true },
  photoUrl: String,
  dob: { type: Date, required: true },
  gender: { type: String, enum: ['male', 'female', 'other', 'unspecified'], default: 'unspecified' },
  joiningDate: { type: Date, required: true },
  emergencyContact: { name: String, phone: String },
  trainer: ref('Trainer', { index: true }),
  fitnessGoal: { type: String, enum: ['general_fitness', 'weight_management', 'muscle_building', 'strength', 'consistency', 'maintain'], default: 'general_fitness' },
  activityLevel: { type: String, enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'], default: 'light' },
  targetWeightKg: { type: Number, min: 20, max: 400 },
  healthConsiderations: { type: String, maxlength: 500 }, // voluntary; hidden from front-desk staff
  consent: { healthData: { type: Boolean, default: false }, recordedAt: Date, recordedBy: ref('User') },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  isDemo: { type: Boolean, default: false },
}, opts));

export const Plan = model('MembershipPlan', new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  durationValue: { type: Number, required: true, min: 1, validate: Number.isInteger },
  durationUnit: { type: String, enum: ['months', 'days'], default: 'months' },
  price: { type: Number, required: true, min: 0 },
  description: String,
  facilities: [String],
  includesPersonalTraining: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, opts));

// History is append-only: renewals/plan changes create NEW documents; old ones are never overwritten.
const membershipSchema = new Schema({
  member: ref('Member', { required: true }),
  plan: ref('MembershipPlan', { required: true }),
  planSnapshot: { name: String, price: Number, durationValue: Number, durationUnit: String, includesPersonalTraining: Boolean },
  kind: { type: String, enum: ['new', 'renewal', 'plan_change'], required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  discount: { type: Number, min: 0, default: 0 },
  amountDue: { type: Number, required: true, min: 0 },
  amountPaid: { type: Number, default: 0, min: 0 }, // atomic counter, guarded so it can never exceed amountDue
  status: { type: String, enum: ['active', 'superseded', 'cancelled'], default: 'active' },
  previous: ref('MemberMembership'),
  createdBy: ref('User'),
}, opts);
membershipSchema.index({ member: 1, startDate: -1 });
membershipSchema.index({ endDate: 1 });
export const Membership = model('MemberMembership', membershipSchema);

const attendanceSchema = new Schema({
  member: ref('Member', { required: true }),
  dayKey: { type: String, required: true }, // YYYY-MM-DD in gym timezone
  checkInAt: { type: Date, required: true },
  checkOutAt: Date,
  method: { type: String, enum: ['manual', 'qr'], default: 'manual' },
  membershipState: String,
  recordedBy: ref('User'),
}, opts);
attendanceSchema.index({ member: 1, dayKey: 1 }, { unique: true }); // duplicate check-in prevention (one per day)
attendanceSchema.index({ dayKey: 1 });
export const Attendance = model('Attendance', attendanceSchema);

const paymentSchema = new Schema({
  receiptNo: { type: String, unique: true },
  member: ref('Member', { required: true, index: true }),
  membership: ref('MemberMembership'),
  kind: { type: String, enum: ['membership', 'personal_training', 'other'], default: 'membership' },
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, enum: ['cash', 'upi', 'card', 'bank_transfer', 'other'], required: true },
  status: { type: String, enum: ['paid', 'refunded'], default: 'paid' },
  source: { type: String, enum: ['manual', 'gateway'], default: 'manual' }, // 'gateway' only after server-side verification
  paidAt: { type: Date, default: Date.now },
  note: String,
  idempotencyKey: { type: String, unique: true, sparse: true },
  recordedBy: ref('User'),
}, opts);
paymentSchema.index({ paidAt: -1 });
export const Payment = model('Payment', paymentSchema);

const metricSchema = new Schema({
  member: ref('Member', { required: true }),
  measuredAt: { type: Date, required: true },
  weightKg: { type: Number, min: 20, max: 400 },
  heightCm: { type: Number, min: 80, max: 250 },
  bmi: Number, // always computed server-side
  bodyFatPct: { type: Number, min: 2, max: 70 },
  measurements: { chestCm: Number, waistCm: Number, hipsCm: Number, armCm: Number, thighCm: Number },
  source: { type: String, enum: ['self_reported', 'trainer_measured', 'device'], default: 'self_reported' },
  isAssessment: { type: Boolean, default: false },
  observation: { type: String, maxlength: 1000 },
  recordedBy: ref('User'),
}, opts);
metricSchema.index({ member: 1, measuredAt: -1 });
export const HealthMetric = model('HealthMetric', metricSchema);

const reviewable = {
  member: ref('Member', { required: true, index: true }),
  createdBy: ref('User'),
  source: { type: String, enum: ['rule_engine', 'trainer'], default: 'rule_engine' },
  status: { type: String, enum: ['pending_review', 'active', 'archived'], default: 'pending_review' },
  plan: Schema.Types.Mixed,
  inputs: Schema.Types.Mixed,
  coachNote: String, // optional LLM narration; never changes numbers or foods
  requiresProfessionalReview: { type: Boolean, default: false },
  reviewedBy: ref('User'), reviewedAt: Date, trainerNotes: String,
};
export const WorkoutPlan = model('WorkoutPlan', new Schema(reviewable, opts));
export const DietPlan = model('DietPlan', new Schema(reviewable, opts));

export const WorkoutLog = model('WorkoutLog', new Schema({
  member: ref('Member', { required: true, index: true }),
  workoutPlan: ref('WorkoutPlan', { required: true }),
  dayNumber: { type: Number, required: true },
  dayKey: { type: String, required: true },
  exercises: [{ name: String, exerciseId: String, targetSets: Number, targetRepsMax: Number, setsDone: Number, minReps: Number, weightKg: Number, discomfort: { type: Boolean, default: false } }],
  hadDiscomfort: { type: Boolean, default: false },
  notes: String,
}, opts));

const adherence = new Schema({ member: ref('Member', { required: true }), dietPlan: ref('DietPlan', { required: true }), dayKey: String, slot: String, followed: Boolean }, opts);
adherence.index({ dietPlan: 1, dayKey: 1, slot: 1 }, { unique: true });
export const DietAdherence = model('DietAdherence', adherence);

const sessionSchema = new Schema({
  member: ref('Member', { required: true }), trainer: ref('Trainer', { required: true }),
  start: { type: Date, required: true }, end: { type: Date, required: true },
  status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
  notes: String, cancelReason: String, createdBy: ref('User'),
}, opts);
sessionSchema.index({ trainer: 1, start: 1 });
sessionSchema.index({ member: 1, start: 1 });
export const PTSession = model('PersonalTrainingSession', sessionSchema);

const notifSchema = new Schema({
  user: ref('User', { required: true }),
  category: { type: String, enum: ['membership', 'payment', 'workout', 'diet', 'session', 'attendance', 'goal', 'system'], required: true },
  title: { type: String, required: true }, message: String, link: String,
  isRead: { type: Boolean, default: false },
  dedupeKey: String,
}, opts);
notifSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notifSchema.index({ user: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
export const Notification = model('Notification', notifSchema);

export const Feedback = model('Feedback', new Schema({
  member: ref('Member', { required: true }),
  category: { type: String, enum: ['service', 'facility', 'trainer', 'trainer_assistance', 'other'], default: 'service' },
  rating: { type: Number, min: 1, max: 5 }, message: { type: String, maxlength: 1000, required: true },
}, opts));

export const AuditLog = model('AuditLog', new Schema({
  actor: ref('User'), actorRole: String, action: { type: String, required: true, index: true },
  entity: String, entityId: String, meta: Schema.Types.Mixed, ip: String,
}, opts));

export const Setting = model('Setting', new Schema({
  key: { type: String, default: 'gym', unique: true },
  gymName: { type: String, default: 'Smart Gym' },
  timezone: { type: String, default: 'Asia/Kolkata' },
  expiryWarningDays: { type: Number, default: 7, min: 1, max: 60 },
  allowExpiredCheckIn: { type: Boolean, default: false },
  renewalPolicy: { type: String, enum: ['extend', 'fromToday'], default: 'extend' },
  inactiveDays: { type: Number, default: 10, min: 3, max: 60 },
  declineRatio: { type: Number, default: 0.5, min: 0.1, max: 0.9 },
  demoData: { type: Boolean, default: false },
}, opts));
