import { motion } from "framer-motion";
import { 
  Droplet, 
  FlaskConical, 
  TestTube, 
  ShieldCheck, 
  Microscope, 
  Heart,
  Activity,
  Stethoscope
} from "lucide-react";

const services = [
  {
    icon: Droplet,
    title: "Haematology",
    description: "Complete blood count, blood grouping, hemoglobin testing, and comprehensive blood analysis.",
    color: "from-red-500 to-rose-600",
  },
  {
    icon: FlaskConical,
    title: "Biochemistry",
    description: "Liver function, kidney function, lipid profile, blood sugar, and metabolic panel tests.",
    color: "from-blue-500 to-indigo-600",
  },
  {
    icon: TestTube,
    title: "Urine Examination",
    description: "Complete urine analysis, culture tests, and urinary tract infection detection.",
    color: "from-amber-500 to-orange-600",
  },
  {
    icon: ShieldCheck,
    title: "Hepatitis B",
    description: "HBsAg testing, hepatitis B surface antibody, and comprehensive hepatitis screening.",
    color: "from-green-500 to-emerald-600",
  },
  {
    icon: Microscope,
    title: "Immunology",
    description: "Autoimmune disorder tests, allergy panels, and immunological assessments.",
    color: "from-purple-500 to-violet-600",
  },
  {
    icon: Heart,
    title: "Cardiac Markers",
    description: "Troponin tests, cardiac enzyme analysis, and heart health evaluations.",
    color: "from-pink-500 to-rose-600",
  },
  {
    icon: Activity,
    title: "Hormone Tests",
    description: "Thyroid function, reproductive hormones, and endocrine system evaluations.",
    color: "from-cyan-500 to-teal-600",
  },
  {
    icon: Stethoscope,
    title: "General Health",
    description: "Comprehensive health packages, preventive screening, and wellness checkups.",
    color: "from-clinical-blue to-clinical-blue-dark",
  },
];

const ServicesSection = () => {
  return (
    <section id="services" className="py-20 lg:py-28 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-4"
          >
            Our Services
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-4xl lg:text-5xl font-heading font-bold text-foreground mb-4"
          >
            Comprehensive Diagnostic{" "}
            <span className="text-primary">Services</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-muted-foreground text-lg"
          >
            We offer a wide range of pathological tests with accurate results and quick turnaround time.
          </motion.p>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className="group relative bg-card rounded-xl p-6 shadow-md hover:shadow-xl transition-all duration-300 border border-border hover:border-primary/30 overflow-hidden"
            >
              {/* Gradient Background on Hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${service.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
              
              {/* Icon */}
              <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${service.color} text-primary-foreground mb-4 shadow-md`}>
                <service.icon className="h-6 w-6" />
              </div>

              {/* Content */}
              <h3 className="text-lg font-heading font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                {service.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {service.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
