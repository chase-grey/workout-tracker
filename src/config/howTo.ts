/**
 * How each movement is done: a few cues to read between sets, and somewhere to
 * watch it.
 *
 * Keyed by exercise key, the same one the plan, the starter templates
 * (config/planTemplates), the builder's library (lib/planBuilder) and the
 * stretch routines (config/flexRoutines) use, so one entry serves a movement
 * wherever it turns up. A movement nothing here knows (one typed in by hand, or
 * added by the coach) still gets a sheet: no cues, and a YouTube search for its
 * name (see {@link howTo}).
 *
 * The stretches lead with matthewismith's videos where he has one on the skill:
 * the routines are built on his toolkit (see config/flexRoutines), so his is the
 * explanation the routine was written from. They are long videos about a whole
 * skill rather than a clip of one stretch, which is why they carry their title
 * here, and why most are followed by a short one of the stretch itself.
 *
 * Every video id here was read off YouTube and checked against its channel, not
 * recalled. Adding one, check it the same way: the id decides what plays.
 */

export type HowToVideo = {
  /** The YouTube video id. */
  id: string
  /** The channel it's on, which is what the link is labelled with. */
  by: string
  /** What the video is, when it isn't simply this movement. */
  title?: string
  /** Seconds in, when the movement has a chapter of its own. */
  start?: number
}

export type HowTo = {
  cues: string[]
  videos: HowToVideo[]
}

const yt = (id: string, by: string, title?: string, start?: number): HowToVideo => ({ id, by, title, start })

const SIDE_SPLIT = (start?: number) => yt('bJl4VSoESpo', 'matthewismith', 'mechanics of a side split', start)
const TOE_TOUCH = yt('Qipko5cMmi0', 'matthewismith', 'mechanics of touching your toes')
const SHOULDERS = yt('Pg4X26PbdS4', 'matthewismith', 'mechanics of shoulder mobility & flexibility')

const HOW_TO: Record<string, HowTo> = {
  // ---- abs and core ----
  cable_crunch: {
    cues: [
      'kneel facing the stack and hold the rope beside your head',
      'curl your ribs down toward your hips, rounding the back',
      'keep the hips still: the abs pull the weight, not the arms or a sit back',
    ],
    videos: [yt('AV5PmZJIrrw', 'Colossus Fitness')],
  },
  weighted_situp: {
    cues: [
      'hook your feet in on the decline bench and hold the plate on your chest',
      'curl up one vertebra at a time until you are upright',
      'lower slowly, and stop just short of resting at the bottom',
    ],
    videos: [yt('QhGU5cmNZds', 'ScottHermanFitness')],
  },
  mat_situp: {
    cues: [
      'lie on the mat with knees bent, feet flat, and the weight held on your chest',
      'curl up until your chest reaches your thighs',
      'lower under control rather than dropping back',
    ],
    videos: [yt('kZvSaq192cg', 'LIVESTRONG')],
  },
  floor_crunch: {
    cues: [
      'lie on your back with knees bent and hands light behind your head',
      'curl the shoulder blades off the floor, ribs toward hips',
      'keep the low back down and the chin off the chest',
    ],
    videos: [yt('NGRKFMKhF8s', 'ScottHermanFitness')],
  },
  hanging_leg_raise: {
    cues: [
      'hang from the bar with shoulders pulled down, not shrugged',
      'tuck the pelvis and bring your knees up past your hips',
      'lower slowly so the legs do not swing',
    ],
    videos: [yt('l7OroezzX9k', 'Runna')],
  },
  deadbug: {
    cues: [
      'lie on your back, arms straight up, hips and knees at ninety degrees',
      'press the low back into the floor and keep it there',
      'reach one arm and the opposite leg away slowly, return, and change sides',
    ],
    videos: [yt('GbSC02oU3To', 'Hinge Health')],
  },
  plank: {
    cues: [
      'elbows under shoulders, legs straight, body in one line from head to heels',
      'squeeze the glutes and brace the abs so the hips neither sag nor pike',
      'breathe steadily for the whole hold',
    ],
    videos: [yt('6LqqeBtFn9M', 'Get Exercise Confident')],
  },
  rkc_plank: {
    cues: [
      'set a plank with elbows a little ahead of the shoulders and fists clenched',
      'tuck the pelvis and squeeze glutes, quads and abs as hard as you can',
      'pull elbows and toes toward each other without moving them',
    ],
    videos: [yt('4hQmAsF9iL4', 'Dr. Carl Baird')],
  },

  // ---- chest ----
  flat_bench: {
    cues: [
      'lie with eyes under the bar, feet planted, shoulder blades pinched back and down',
      'lower to the mid chest with elbows tucked about forty-five degrees',
      'press back up over the shoulders without lifting your hips',
    ],
    videos: [yt('gRVjAtPip0Y', 'Buff Dudes')],
  },
  'flat_bench:dumbbells': {
    cues: [
      'lie back with a dumbbell over each shoulder, feet planted, shoulder blades pinched back',
      'lower until the dumbbells are level with your chest, elbows about forty-five degrees out',
      'press up and slightly together without clashing them',
    ],
    videos: [yt('VmB1G1K7v94', 'ScottHermanFitness')],
  },
  incline_bench: {
    cues: [
      'set the bench to about thirty degrees and pin your shoulder blades back',
      'lower the dumbbells to the upper chest, forearms vertical',
      'press up over the collarbones, not out over your face',
    ],
    videos: [yt('IP4oeKh1Sd4', 'Max Euceda')],
  },
  seated_chest_press: {
    cues: [
      'set the seat so the handles line up with your mid chest',
      'keep your shoulder blades back against the pad and press until your arms are straight',
      'let the handles come back slowly to a full stretch',
    ],
    videos: [yt('P8Hx90LdGH4', 'Colossus Fitness')],
  },
  db_floor_press: {
    cues: [
      'lie on the floor, knees bent, a dumbbell over each shoulder',
      'lower until your upper arms touch the floor, elbows about forty-five degrees out',
      'pause there, then press straight up',
    ],
    videos: [yt('uUGDRwge4F8', 'ScottHermanFitness')],
  },
  cable_fly: {
    cues: [
      'stand between the pulleys with one foot forward and a slight bend in the elbows',
      'sweep your hands together in a wide arc in front of your chest',
      'open back up slowly until you feel the chest stretch',
    ],
    videos: [yt('hrh0K1Oo7Yc', 'Colossus Fitness')],
  },
  db_fly: {
    cues: [
      'lie back with the dumbbells over your chest, palms facing, elbows slightly bent',
      'open the arms wide until the chest stretches, keeping that elbow bend',
      'hug them back together over the chest',
    ],
    videos: [yt('eozdVDA78K0', 'ScottHermanFitness')],
  },
  iso_chest: {
    cues: [
      'set the seat so your hands are level with your chest',
      'keep your shoulder blades against the pad and a slight bend in the elbows',
      'bring the handles together, squeeze, and open slowly',
    ],
    videos: [yt('H4mVGHaK2f4', 'Colossus Fitness')],
  },
  pushup: {
    cues: [
      'hands just outside shoulder width, body in one line from head to heels',
      'lower your chest to the floor with elbows about forty-five degrees out',
      'press up without letting the hips sag',
    ],
    videos: [yt('IODxDxX7oi4', 'Calisthenicmovement')],
  },
  decline_pushup: {
    cues: [
      'put your feet up on a bench or step, hands on the floor under the shoulders',
      'keep the body straight and lower your chest between your hands',
      'press up without piking the hips',
    ],
    videos: [yt('SKPab2YC8BE', 'ScottHermanFitness')],
  },

  // ---- shoulders ----
  machine_overhead_press: {
    cues: [
      'set the seat so the handles start level with your shoulders',
      'keep your back on the pad and press up until your arms are nearly straight',
      'lower to shoulder height under control',
    ],
    videos: [yt('3R14MnZbcpw', 'Colossus Fitness')],
  },
  db_overhead_press: {
    cues: [
      'hold the dumbbells at shoulder height, elbows a little in front of your body',
      'press straight up until the arms are locked out overhead',
      'keep the ribs down so the low back does not arch',
    ],
    videos: [yt('qEwKCR5JCog', 'ScottHermanFitness')],
  },
  lateral_raise: {
    cues: [
      'stand side-on to a low pulley and hold the handle in the far hand',
      'raise the arm out to the side to shoulder height, leading with the elbow',
      'lower slowly without letting the stack touch down',
    ],
    videos: [yt('-CAGLnWUkWA', 'Jacob Garcia')],
  },
  db_lateral_raise: {
    cues: [
      'stand with a dumbbell in each hand and a slight bend in the elbows',
      'raise the arms out to the sides to shoulder height, leading with the elbows',
      'lower slowly rather than swinging',
    ],
    videos: [yt('PzsMitRdI_8', 'Max Euceda')],
  },
  pike_pushup: {
    cues: [
      'start in a push-up, then walk your feet in until your hips are high',
      'lower the top of your head toward the floor ahead of your hands',
      'press back up, pushing the floor away',
    ],
    videos: [yt('fXgou2W10ok', 'The Bodyweight Process')],
  },

  // ---- triceps ----
  tricep_pushdown: {
    cues: [
      'stand at a high pulley with your elbows pinned to your sides',
      'push the handle down until your arms are straight',
      'let it rise only until your forearms pass level, elbows still',
    ],
    videos: [yt('-zLyUAo1gMw', 'Max Euceda')],
  },
  overhead_tricep_ext: {
    cues: [
      'face away from the pulley with the rope behind your head and elbows pointing forward',
      'straighten your arms overhead without letting the elbows flare',
      'lower until you feel the triceps stretch',
    ],
    videos: [yt('GzmlxvSFE7A', 'Colossus Fitness')],
  },
  db_tricep_extension: {
    cues: [
      'hold one dumbbell overhead in both hands',
      'lower it behind your head by bending only at the elbows',
      'keep the elbows pointing up and straighten the arms',
    ],
    videos: [yt('-Vyt2QdsR7E', 'ScottHermanFitness')],
  },
  diamond_pushup: {
    cues: [
      'hands together under your chest, thumbs and forefingers touching',
      'lower your chest to your hands with the elbows close to your ribs',
      'press up with the body in one line',
    ],
    videos: [yt('J0DnG1_S92I', 'ScottHermanFitness')],
  },
  chair_dip: {
    cues: [
      'hands on the edge of a sturdy chair behind you, legs out in front',
      'lower until your elbows reach about ninety degrees, back close to the chair',
      'press up without shrugging your shoulders',
    ],
    videos: [yt('AWz_7B1cch0', 'Coach Nick Fitness')],
  },

  // ---- back ----
  weighted_pullups: {
    cues: [
      'hang the weight from a belt and start from a dead hang',
      'pull your elbows down to your ribs until your chin clears the bar',
      'lower all the way under control',
    ],
    videos: [yt('HuuyDNGrCI8', 'ScottHermanFitness')],
  },
  pullup: {
    cues: [
      'hang with hands just outside shoulder width',
      'pull your shoulders down, then drive your elbows to your ribs until your chin clears the bar',
      'lower to straight arms each rep',
    ],
    videos: [yt('eGo4IYlbE5g', 'Calisthenicmovement')],
  },
  cable_pulldown: {
    cues: [
      'lock your thighs under the pad and grip just outside shoulder width',
      'lean back slightly and pull the bar to your upper chest, elbows down',
      'let it rise until your arms are straight',
    ],
    videos: [yt('j9jtjL8FhPI', 'Erin Stern')],
  },
  seated_row: {
    cues: [
      'sit tall with knees slightly bent and arms straight',
      'pull the handle to your stomach, squeezing the shoulder blades together',
      'reach forward again without rounding your back',
    ],
    videos: [yt('vwHG9Jfu4sw', 'Max Euceda')],
  },
  cable_row: {
    cues: [
      'sit tall with the neutral-grip handle and knees slightly bent',
      'pull it to your stomach with the elbows close to your sides',
      'reach forward again without rounding your back',
    ],
    videos: [yt('qqZHnqzvbXs', 'Functional AF')],
  },
  barbell_row: {
    cues: [
      'hinge at the hips with a flat back, the bar hanging below your shoulders',
      'pull it to your lower ribs, elbows back',
      'lower under control without standing up between reps',
    ],
    videos: [yt('FWJR5Ve8bnQ', 'Max Euceda')],
  },
  one_arm_db_row: {
    cues: [
      'one hand and knee on a bench, back flat',
      'pull the dumbbell to your hip, elbow close to your side',
      'lower to a full stretch without twisting your torso',
    ],
    videos: [yt('dFzUjzfih7k', 'Max Euceda')],
  },
  db_bent_row: {
    cues: [
      'hinge at the hips with a flat back, dumbbells hanging below your shoulders',
      'pull them to your hips, squeezing the shoulder blades together',
      'lower under control without standing up between reps',
    ],
    videos: [yt('fFmwY2dA2ds', 'Lift With Michelle - Exercise Form Tutorials')],
  },
  superman: {
    cues: [
      'lie face down with your arms stretched out ahead',
      'lift your arms, chest and legs a few inches off the floor',
      'pause, then lower slowly, eyes on the floor',
    ],
    videos: [yt('J9zXkxUAfUA', "Children's Hospital Colorado")],
  },
  reverse_snow_angel: {
    cues: [
      'lie face down with arms at your sides, palms down, and lift them and your chest',
      'sweep your arms in a wide arc overhead, keeping them off the floor',
      'sweep back down to your hips',
    ],
    videos: [yt('0qLP2RNKX4A', 'Leap Fitness')],
  },
  prone_swimmer: {
    cues: [
      'lie face down with your arms stretched out ahead and lifted',
      'sweep them round and back, finishing with your hands behind your low back',
      'reverse the path, arms off the floor throughout',
    ],
    videos: [yt('P_YdO_bLrwk', 'The Active Life')],
  },

  // ---- biceps ----
  incline_db_curl: {
    cues: [
      'set the seat so your armpits sit at the top of the pad',
      'curl the handles up without lifting your elbows off the pad',
      'lower until your arms are almost straight',
    ],
    videos: [yt('AR-oARBkYxI', 'Colossus Fitness')],
  },
  incline_dumbbell_curl: {
    cues: [
      'lie back on an incline bench with your arms hanging straight down',
      'curl the dumbbells up while your elbows stay pointing at the floor',
      'lower all the way to a full stretch',
    ],
    videos: [yt('soxrZlIl35U', 'ScottHermanFitness')],
  },
  hammer_curl: {
    cues: [
      'stand with the dumbbells at your sides, palms facing each other',
      'curl them up with your elbows pinned to your ribs and palms still facing in',
      'lower slowly without swinging',
    ],
    videos: [yt('BRVDS6HVR9Q', 'Buff Dudes Workouts')],
  },

  // ---- legs ----
  leg_press: {
    cues: [
      'feet shoulder width in the middle of the plate, back and hips flat on the pad',
      'lower until your knees reach about ninety degrees without your hips rolling up',
      'press through your whole foot and stop short of locking your knees',
    ],
    videos: [yt('K5n2vg3oZa4', 'Colossus Fitness')],
  },
  barbell_squat: {
    cues: [
      'bar across your upper back, feet about shoulder width, toes slightly out',
      'sit down between your hips, knees tracking over your toes, chest up',
      'drive up through the middle of your feet',
    ],
    videos: [yt('gcNh17Ckjgg', 'Jeremy Ethier')],
  },
  goblet_squat: {
    cues: [
      'hold one dumbbell against your chest, elbows tucked',
      'sit down between your heels with your chest up',
      'drive up through the middle of your feet',
    ],
    videos: [yt('gCESNsDsbqk', 'BuiltLean®')],
  },
  bodyweight_squat: {
    cues: [
      'feet about shoulder width, toes slightly out',
      'sit back and down until your thighs are at least level, knees over toes',
      'stand up tall, heels down throughout',
    ],
    videos: [yt('P-yaD24bUE8', 'Runna')],
  },
  sumo_squat: {
    cues: [
      'take a wide stance with your toes turned out',
      'sit straight down, pushing your knees out over your toes',
      'stand up and squeeze your glutes at the top',
    ],
    videos: [yt('kjlfpqXnyL8', 'Well+Good')],
  },
  leg_extension: {
    cues: [
      'set the back pad so your knees line up with the pivot and the roller sits on your shins',
      'straighten your legs fully and pause',
      'lower slowly without letting the stack touch down',
    ],
    videos: [yt('YyvSfVjQeL0', 'ScottHermanFitness')],
  },
  hamstring_curl: {
    cues: [
      'line your knees up with the pivot and set the roller just above your heels',
      'curl your heels back as far as they go',
      'let the weight return slowly until your legs are straight',
    ],
    videos: [yt('oFxEDkppbSQ', 'Physique Development')],
  },
  slider_leg_curl: {
    cues: [
      'lie on your back with your heels on sliders or a towel and lift your hips',
      'pull your heels in toward you, hips staying up',
      'slide them back out slowly',
    ],
    videos: [yt('kkkTfzi2gj4', 'Kia Khadem')],
  },
  romanian_deadlift: {
    cues: [
      'stand with the bar at your thighs and a soft bend in your knees',
      'push your hips back with a flat back, the bar sliding down your legs',
      'stop when your hamstrings are stretched, then drive your hips forward',
    ],
    videos: [yt('3VXmecChYYM', 'Max Euceda')],
  },
  db_romanian_deadlift: {
    cues: [
      'stand with the dumbbells in front of your thighs and a soft bend in your knees',
      'push your hips back with a flat back, the dumbbells close to your legs',
      'stop when your hamstrings are stretched, then drive your hips forward',
    ],
    videos: [yt('hQgFixeXdZo', 'Mike | J2FIT Strength & Conditioning')],
  },
  db_split_squat: {
    cues: [
      'take a long stride and stay there, a dumbbell in each hand',
      'drop your back knee straight down toward the floor',
      'push up through your front heel, torso upright',
    ],
    videos: [yt('m8mQ_92_Ylg', 'Jack Hanrahan Fitness')],
  },
  reverse_lunge: {
    cues: [
      'step one foot back and lower that knee toward the floor',
      'keep most of your weight on the front heel and your torso upright',
      'push through the front foot to stand back up',
    ],
    videos: [yt('Ry-wqegeKlE', 'Dr. Carl Baird')],
  },
  db_reverse_lunge: {
    cues: [
      'hold a dumbbell in each hand, step one foot back and lower that knee toward the floor',
      'keep most of your weight on the front heel and your torso upright',
      'push through the front foot to stand back up',
    ],
    videos: [yt('sjlsISvHyZs', 'ScottHermanFitness')],
  },
  leg_adductor: {
    cues: [
      'sit back against the pad with your legs out against the pads',
      'squeeze your knees together and pause',
      'open slowly to a comfortable stretch',
    ],
    videos: [yt('MLBm7i341Rw', 'Colossus Fitness')],
  },
  leg_abductor: {
    cues: [
      'sit back against the pad with the pads on the outside of your knees',
      'push your knees apart and pause',
      'bring them back slowly without the stack touching down',
    ],
    videos: [yt('OjI5OpV6IWA', 'Colossus Fitness')],
  },
  copenhagen_plank: {
    cues: [
      'lie on your side with your top leg on a bench and your elbow under your shoulder',
      'lift your hips so your body is one straight line, held up by the top leg',
      'hold it there, bottom leg off the floor',
    ],
    videos: [yt('YRRnnZsRs9U', 'E3 Rehab')],
  },
  sideways_leg_raise: {
    cues: [
      'lie on your side, bottom knee bent, top leg straight and in line with your body',
      'lift the top leg, leading with the heel, toes pointing forward',
      'lower slowly without rolling your hips back',
    ],
    videos: [yt('-rDiQXjeXO0', '[P]rehab')],
  },

  // ---- glutes ----
  hip_thrust: {
    cues: [
      'shoulder blades on the edge of a bench, feet flat, the weight across your hips',
      'drive your hips up until your body is level from shoulders to knees',
      'tuck your chin, squeeze your glutes at the top, and lower under control',
    ],
    videos: [yt('xDmFkJxPzeM', 'Jeff Nippard')],
  },
  db_hip_thrust: {
    cues: [
      'shoulder blades on the edge of a bench, feet flat, a dumbbell held on your hips',
      'drive your hips up until your body is level from shoulders to knees',
      'squeeze your glutes at the top and lower under control',
    ],
    videos: [yt('29OfN4ztW_g', 'Mike | J2FIT Strength & Conditioning')],
  },
  glute_bridge: {
    cues: [
      'lie on your back with knees bent and feet flat near your hips',
      'push through your heels and lift your hips until you are straight from shoulders to knees',
      'squeeze your glutes, then lower slowly',
    ],
    videos: [yt('OUgsJ8-Vi0E', 'Airrosti Rehab Centers')],
  },
  single_leg_glute_bridge: {
    cues: [
      'lie on your back with one foot flat and the other leg lifted',
      'push through the planted heel until you are straight from shoulders to knee',
      'keep your hips level as you lift and lower',
    ],
    videos: [yt('b1zTCyGJXCQ', 'Dr. Carl Baird')],
  },

  // ---- calves ----
  calf_raise: {
    cues: [
      'stand with the balls of your feet on the edge of the step',
      'rise as high as you can and pause at the top',
      'lower until your heels are below the step',
    ],
    videos: [yt('k8ipHzKeAkQ', "Children's Hospital Colorado")],
  },
  db_calf_raise: {
    cues: [
      'hold a dumbbell at your side with the balls of your feet on a step',
      'rise as high as you can and pause at the top',
      'lower until your heels are below the step',
    ],
    videos: [yt('hPA98_r-6e4', 'Horton Barbell')],
  },
  bw_calf_raise: {
    cues: [
      'stand tall, a hand on something for balance',
      'rise onto the balls of your feet as high as you can and pause',
      'lower slowly',
    ],
    videos: [yt('_5R7wFS6l9o', 'IKON Fitness')],
  },

  // ---- neck ----
  neck_flexion: {
    cues: [
      'lie face up on a bench with your head off the end and a plate held on your forehead',
      'tuck your chin and curl your head up toward your chest',
      'lower slowly, only as far as is comfortable',
    ],
    videos: [yt('o78kjeBJUBQ', 'Live Lean TV Daily Exercises')],
  },
  neck_extension: {
    cues: [
      'lie face down on a bench with your head off the end and a plate held on the back of your head',
      'lift your head until it is in line with your spine or just past',
      'lower slowly, only as far as is comfortable',
    ],
    videos: [yt('hYqVUHC-GhE', 'Live Lean TV Daily Exercises')],
  },

  // ---- side split ----
  tailors_pose: {
    cues: [
      'sit tall with the soles of your feet together and your heels drawn in',
      'press your knees toward the floor on the way down and hold them there',
      'ease them back up, staying tall rather than rounding forward',
    ],
    videos: [SIDE_SPLIT(), yt('gF2si3AeR2E', 'Strength Side')],
  },
  horse_squat: {
    cues: [
      'stand wide with your toes turned out and your knees tracking over them',
      'sink straight down with an upright torso and hold the bottom',
      'push the floor apart with your feet as you stand',
    ],
    videos: [SIDE_SPLIT(567)],
  },
  pancake_hang: {
    cues: [
      'sit in a wide straddle with knees and toes pointing up',
      'hinge forward from the hips with a long spine, pushing your chest down and out',
      'then let your weight hang and breathe out into it',
    ],
    videos: [yt('CHRUb43S6RM', 'Strength Side')],
  },
  straddle_leg_lift: {
    cues: [
      'sit in a straddle with your hands on the floor in front of you',
      'lift one or both legs off the floor with the knees locked',
      'lower slowly, and move your hands further forward to make it harder',
    ],
    videos: [yt('DCgNKOnJya0', 'Dani Winks Flexibility')],
  },

  // ---- head to toe ----
  rolling_feet: {
    cues: [
      'stand with a ball under one foot, a hand on something for balance',
      'roll slowly from heel to toes across the whole sole',
      'pause and lean in on the tender spots',
    ],
    videos: [TOE_TOUCH, yt('zy69TOS6ick', 'The Healing Sole')],
  },
  sciatic_floss: {
    cues: [
      'lie on your back with a strap round one foot and that leg raised',
      'glide forward: straighten the knee and pull the toes back as far as is comfortable',
      'glide back: bend the knee and point the foot; it should never hurt or tingle',
    ],
    videos: [TOE_TOUCH, yt('OMbKv94Bu_U', '[BackSpace] Chiropractic Fitness TV')],
  },
  pike_block_crush: {
    cues: [
      'sit with one leg straight and its heel on a block, folded forward over it',
      'press down: drive the heel into the block as hard as you can',
      'rest: let most of it go without leaving the fold',
    ],
    videos: [TOE_TOUCH],
  },
  pike_lift: {
    cues: [
      'sit in a pike, legs straight, hands on the floor beside your knees',
      'press down: push the leg into the floor',
      'pull up: lift the heel off the floor with the knee locked, without leaning back',
    ],
    videos: [TOE_TOUCH, yt('WR3C2cliSaA', 'The Movement Collective')],
  },
  calf_stretch: {
    cues: [
      'hands on a wall, one foot back with its heel on the floor',
      'lean in until the calf stretches, back knee straight',
      'turn the foot straight, in, then out as each set asks',
    ],
    videos: [TOE_TOUCH, yt('iIQx2Cx2NoQ', 'Garrett McLaughlin')],
  },

  // ---- front split ----
  couch_stretch: {
    cues: [
      'kneel with your back shin up a wall or couch and the other foot planted in front',
      'tuck your pelvis and squeeze the glute of the back leg',
      'bring your torso upright only as far as you can keep that tuck',
    ],
    videos: [yt('d9pOjXCKGN8', 'Tom Morrison')],
  },
  half_split: {
    cues: [
      'kneel on one knee with the other leg straight out in front, heel down',
      'hinge forward over the front leg with a long spine, hips square',
      'push the heel into the floor, then relax and sink a little further',
    ],
    videos: [yt('gTjRgU8M_B0', 'Jenn Gelfand ~ Root To Rise PT')],
  },
  front_split_hold: {
    cues: [
      'slide your front heel forward and your back knee back, hands on blocks or the floor',
      'keep your hips square to the front, back knee pointing down',
      'go as low as you can stay relaxed in, and breathe',
    ],
    videos: [yt('k0HHzxa7St8', 'Anna McNulty')],
  },

  // ---- bridge ----
  kneeling_lunge: {
    cues: [
      'kneel on one knee with the other foot planted in front',
      'tuck your pelvis and squeeze the glute of the back leg',
      'shift your hips forward without arching your low back',
    ],
    videos: [yt('34SlL-PPCWQ', 'MGHOrthopaedics')],
  },
  puppy_pose: {
    cues: [
      'kneel with your hips over your knees and walk your hands out in front',
      'sink your chest toward the floor with your arms straight',
      'keep your hips over your knees and your ribs from flaring',
    ],
    videos: [SHOULDERS, yt('i1-bFRjloeI', 'Yoga 15 with Abi')],
  },
  bridge_hold: {
    cues: [
      'lie on your back with feet flat by your hips and hands by your ears, fingers toward your shoulders',
      'press up, straighten your arms, and push your chest back over your hands',
      'hold with your knees in line and your weight on your shoulders, not your low back',
    ],
    videos: [yt('tSvmWU-0Zo0', 'FitnessFAQs')],
  },

  // ---- shoulders ----
  shoulder_dislocate: {
    cues: [
      'hold a stick in a wide grip in front of your hips with your arms straight',
      'lift it overhead and on down behind your back without bending your elbows',
      'bring it back the same way, and narrow your grip as it gets easier',
    ],
    videos: [SHOULDERS, yt('vP8YmmRMz6I', 'GMB Fitness (Praxis)')],
  },
  shoulder_extension: {
    cues: [
      'sit with your hands on the floor behind you, fingers pointing away',
      'slide your hips forward until the front of your shoulders stretches',
      'keep your chest lifted and your shoulders down from your ears',
    ],
    videos: [SHOULDERS],
  },

  // ---- pelvic tilt ----
  lying_pelvic_tilt: {
    cues: [
      'lie on your back with knees bent and feet flat',
      'press down: flatten your low back into the floor by tucking your tailbone',
      'hold it, then rest and let the small arch come back',
    ],
    videos: [yt('44D6Xc2Fkek', 'Rehab My Patient')],
  },
  standing_pelvic_tilt: {
    cues: [
      'stand with your back to a wall, heels a little way out',
      'press down: tuck your tailbone until your low back flattens against the wall',
      'hold it, then rest; your knees stay soft and your ribs stay down',
    ],
    videos: [yt('O6R5YRRxwy0', 'Rehab My Patient')],
  },
  lunge_stretch: {
    cues: [
      'step into a low lunge with your back knee on the floor',
      'tuck your pelvis first, then ease your hips forward',
      'keep the tuck: the stretch is the front of the back hip, not an arch in your back',
    ],
    videos: [yt('sOiI4kPgGA4', 'Mobility Doc')],
  },
  rectus_femoris_stretch: {
    cues: [
      'kneel in a lunge and bring your back foot up behind you, in your hand or against a wall',
      'tuck your pelvis and squeeze the glute of the back leg',
      'stay upright; the stretch runs down the front of the thigh',
    ],
    videos: [yt('M48eh3OMNcE', 'Precision Movement')],
  },
}

/** Keys that are the same movement as one above. */
const SAME_AS: Record<string, string> = {
  cable_overhead_extension: 'overhead_tricep_ext',
  prayer_curls: 'incline_db_curl',
  pullups_or_pulldown: 'weighted_pullups',
}

/**
 * What a movement typed in by hand is likely to be called, as a slug, to the
 * key it is here. Only names that can mean nothing else.
 */
const NAMED: Record<string, string> = {
  bench_press: 'flat_bench',
  dumbbell_bench_press: 'flat_bench:dumbbells',
  incline_dumbbell_press: 'incline_bench',
  incline_press: 'incline_bench',
  chest_press: 'seated_chest_press',
  pec_deck: 'iso_chest',
  chest_fly: 'iso_chest',
  shoulder_press: 'db_overhead_press',
  overhead_press: 'db_overhead_press',
  lat_pulldown: 'cable_pulldown',
  pulldown: 'cable_pulldown',
  pull_up: 'pullup',
  pull_ups: 'pullup',
  chin_up: 'pullup',
  chin_ups: 'pullup',
  push_up: 'pushup',
  push_ups: 'pushup',
  squat: 'barbell_squat',
  back_squat: 'barbell_squat',
  rdl: 'romanian_deadlift',
  leg_curl: 'hamstring_curl',
  preacher_curl: 'incline_db_curl',
  dead_bug: 'deadbug',
  crunch: 'floor_crunch',
  crunches: 'floor_crunch',
  sit_up: 'mat_situp',
  sit_ups: 'mat_situp',
  hanging_knee_raise: 'hanging_leg_raise',
  butterfly_stretch: 'tailors_pose',
  horse_stance: 'horse_squat',
  pancake: 'pancake_hang',
  pancake_stretch: 'pancake_hang',
  shoulder_dislocates: 'shoulder_dislocate',
  pass_through: 'shoulder_dislocate',
  hip_flexor_stretch: 'kneeling_lunge',
  bridge: 'bridge_hold',
  front_split: 'front_split_hold',
}

/** A name or key without its side: `lateral raise (left)`, `lateral_raise_l`. */
const sideless = (s: string) => s.replace(/\s*\((left|right)\)\s*$/i, '').replace(/_(l|r)$/, '')

const slug = (name: string) =>
  sideless(name)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

function entryFor(key: string): HowTo | undefined {
  const k = sideless(key)
  return HOW_TO[k] ?? HOW_TO[SAME_AS[k]] ?? HOW_TO[NAMED[k]]
}

export type HowToSheetContent = HowTo & {
  /** The movement's name without its side, which is what the sheet is titled. */
  name: string
  /** A YouTube search for the movement: all there is for one nothing here knows. */
  searchUrl: string
}

/**
 * What the how-to sheet shows for a movement: by its key, else by what it's
 * called, else nothing but the search.
 *
 * `dumbbells` picks the dumbbell version of a movement the plans load either
 * way (the flat bench: a bar in the gym template, a pair of dumbbells in the
 * owner's plan and the dumbbell template).
 */
export function howTo(key: string, name: string, { dumbbells = false } = {}): HowToSheetContent {
  const title = sideless(name)
  const k = sideless(key)
  const found =
    (dumbbells ? HOW_TO[`${k}:dumbbells`] : undefined) ?? entryFor(key) ?? entryFor(slug(name))
  return {
    name: title,
    cues: found?.cues ?? [],
    videos: found?.videos ?? [],
    searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`how to do ${title}`)}`,
  }
}

/** Whether a movement has cues of its own, rather than only the search. */
export function hasHowTo(key: string, name: string): boolean {
  return howTo(key, name).cues.length > 0
}

export function videoUrl(v: HowToVideo): string {
  return `https://www.youtube.com/watch?v=${v.id}${v.start ? `&t=${v.start}s` : ''}`
}

/** Every video listed, so a test can hold the list to its shape. */
export const ALL_HOW_TO_VIDEOS: HowToVideo[] = Object.values(HOW_TO).flatMap((h) => h.videos)
