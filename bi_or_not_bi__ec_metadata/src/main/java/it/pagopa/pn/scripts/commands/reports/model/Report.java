package it.pagopa.pn.scripts.commands.reports.model;

import it.pagopa.pn.scripts.commands.enumerations.ChronEnum;
import it.pagopa.pn.scripts.commands.enumerations.FormatEnum;

public class Report {

    private String name;
    private String version;
    private FormatEnum outputFormat;
    private ChronEnum chron;
    private ReportTask task;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public FormatEnum getOutputFormat() {
        return outputFormat;
    }

    public void setOutputFormat(FormatEnum outputFormat) {
        this.outputFormat = outputFormat;
    }

    public ChronEnum getChron() {
        return chron;
    }

    public void setChron(ChronEnum chron) {
        this.chron = chron;
    }

    public ReportTask getTask() {
        return task;
    }

    public void setTask(ReportTask task) {
        this.task = task;
    }
}
