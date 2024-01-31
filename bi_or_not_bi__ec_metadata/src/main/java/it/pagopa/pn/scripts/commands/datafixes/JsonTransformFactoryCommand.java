package it.pagopa.pn.scripts.commands.datafixes;

import it.pagopa.pn.scripts.commands.CommandsMain;
import it.pagopa.pn.scripts.commands.datafixes.geokey_if_absent.GeoKeyFixFunction;
import it.pagopa.pn.scripts.commands.datafixes.source_channel_details.SourceChannelDetailsFixFunction;
import picocli.CommandLine;

import java.util.Arrays;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.stream.Collectors;

@CommandLine.Command( name = "jsonTransform")
public class JsonTransformFactoryCommand implements Callable<Integer> {

    @CommandLine.ParentCommand
    private CommandsMain parent;
    private JsonTrasfromationHolder getTransformationHolder() {
        return parent.getJsonTransformations();
    }

    @CommandLine.Option(names = {"--aws-profile"}, arity = "1")
    private String awsProfileName = null;

    @CommandLine.Option(names = {"--aws-region"})
    private String awsRegionCode = "eu-south-1";


    @CommandLine.Parameters( index = "0", description = "Add (+) or remove (-) a json transformation")
    private String operation;

    @CommandLine.Parameters( index = "1", description = "Transformation name")
    private String transformationName;

    @CommandLine.Option( names = {"--flags"}, description = "Comma separated, no spaced, list of flags.\n LENIENT means \"ignore exceptions\"")
    private String flags = "";

    private Set<JsonTransformFlag> getFlagsSet() {
        return Arrays.asList( flags.split(",")).stream()
                .map( JsonTransformFlag::valueOf)
                .collect(Collectors.toSet());
    }

    @Override
    public Integer call() throws Exception {
        System.out.println("JsonTransformFactoryCommand " + operation + " " + transformationName);

        switch ( operation ) {
            case "-" -> getTransformationHolder().remove( transformationName );
            case "+" -> {
                JsonTransformFunction jtf = newTransformationInstance( transformationName );
                getTransformationHolder().add( transformationName, jtf, getFlagsSet() );
            }
            default -> throw new IllegalArgumentException("Operation not supported: " + operation);
        }
        return 0;
    }

    private JsonTransformFunction newTransformationInstance(String transformationName) {
        JsonTransformFunction jtf;

        switch ( transformationName ) {
            case "fixSourceChannelDetails" -> jtf = new SourceChannelDetailsFixFunction( awsProfileName, awsRegionCode );
            case "fixGeoKey" -> jtf = new GeoKeyFixFunction( awsProfileName, awsRegionCode );
            default -> throw new IllegalArgumentException("transformation not supported: " + transformationName);
        }

        return jtf;
    }
}
